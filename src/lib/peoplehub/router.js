// PeopleHub API router, mounted by server.js under /api/peoplehub/* and /api/ctf-admin/*.
// Every handler here assumes the caller already checked the *outer* CTF session has reached
// stage3 (server.js does that before ever calling in). Handlers then separately check the
// *inner* PeopleHub session (phSession) for anything beyond the login endpoint itself.
'use strict';
const { getDb } = require('./db');
const PH = require('./session');
const { can, capsFor } = require('./rbac');
const CS = require('./challengeState');
const TimePay = require('./routes/timepay');
const Documents = require('./routes/documents');
const Requests = require('./routes/requests');
const Reports = require('./routes/reports');
const Recruitment = require('./routes/recruitment');
const Training = require('./routes/training');
const Comms = require('./routes/comms');
const Audit = require('./routes/audit');
const Admin = require('./routes/admin');
const ImportXml = require('./routes/importxml');
const Feedback = require('./routes/feedback');
const Emergency = require('./routes/emergency');

// ---------------------------------------------------------------- small helpers

function requirePhAuth(req) {
  const s = PH.get(req);
  return s; // null if not logged into PeopleHub
}

function employeeSummary(db, employeeId) {
  return db.prepare(`
    SELECT e.employee_id, e.first_name, e.last_name, e.preferred_name, e.job_title,
           d.name AS department, e.location
    FROM employees e JOIN departments d ON d.department_id = e.department_id
    WHERE e.employee_id = ?`).get(employeeId);
}

function fail(send, res, status, message) {
  return send(res, status, { ok: false, error: message });
}

// ---------------------------------------------------------------- auth

async function handleLogin(req, res, { send, readJson }, outerSession) {
  const db = getDb();
  let body;
  try { body = await readJson(req, 1024); } catch (e) { return fail(send, res, 400, 'Invalid request.'); }
  const username = body && typeof body.username === 'string' ? body.username.slice(0, 300) : '';
  const password = body && typeof body.password === 'string' ? body.password.slice(0, 300) : '';
  if (!username) return fail(send, res, 401, 'Invalid username or password.');

  // Intentionally vulnerable: built by string concatenation, exactly like a real broken login
  // query. Nothing in the UI hints at this -- a failed real login and a failed injection attempt
  // both just say "Invalid username or password."; only a query that returns a row (for any
  // reason) succeeds.
  let row, queryError = null;
  try {
    const sql = `SELECT u.user_id, u.username, u.role_id, u.employee_id, u.is_active, r.name AS roleName
      FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE u.username = '${username}' AND u.password_hash = '${password}' LIMIT 1`;
    row = db.prepare(sql).get();
  } catch (e) { queryError = e; }

  if (queryError || !row || !row.is_active) {
    return fail(send, res, 401, 'Invalid username or password.');
  }

  const token = PH.create(row);
  const isBypass = true; // any row returned here is either a real credential match (never happens --
  // password_hash values are opaque placeholders, see seed/generators/accounts.js) or an injection.
  CS.setFlag(db, outerSession.token, 'stage3_login');
  return send(res, 200, { ok: true, message: 'Welcome back.' }, { 'Set-Cookie': PH.cookieHeader(token) });
}

function handleLogout(req, res, { send }) {
  const s = PH.get(req);
  if (s) PH.destroy(s.token);
  return send(res, 200, { ok: true }, { 'Set-Cookie': PH.clearCookieHeader() });
}

function handleMe(req, res, { send }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const emp = s.employeeId ? employeeSummary(db, s.employeeId) : null;
  return send(res, 200, {
    ok: true,
    username: s.username,
    role: s.roleName,
    caps: capsFor(s.roleName),
    employee: emp || null,
  });
}

// ---------------------------------------------------------------- dashboard

function handleDashboard(req, res, { send }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();

  const totalEmployees = db.prepare(`SELECT COUNT(*) n FROM employees WHERE employment_status='Active'`).get().n;
  const openHrRequests = db.prepare(`SELECT COUNT(*) n FROM hr_requests WHERE status IN ('Open','In Progress','Waiting for Employee')`).get().n;
  const pendingApprovals = db.prepare(`SELECT COUNT(*) n FROM leave_records WHERE status='Pending'`).get().n;
  const onLeave = db.prepare(`SELECT COUNT(*) n FROM employees WHERE employment_status='On Leave'`).get().n;

  const headcountByDept = db.prepare(`
    SELECT d.name AS department, COUNT(*) n FROM employees e
    JOIN departments d ON d.department_id = e.department_id
    WHERE e.employment_status='Active' GROUP BY d.name ORDER BY n DESC`).all();

  const recentActivity = db.prepare(`
    SELECT a.timestamp, a.action, a.resource_type, u.username
    FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
    ORDER BY a.timestamp DESC LIMIT 8`).all();

  const upcomingLeave = db.prepare(`
    SELECT l.start_date, l.end_date, l.leave_type, e.first_name, e.last_name
    FROM leave_records l JOIN employees e ON e.employee_id = l.employee_id
    WHERE l.status='Approved' AND l.start_date >= date('now')
    ORDER BY l.start_date ASC LIMIT 6`).all();

  const announcements = db.prepare(`SELECT title, published_at, is_pinned FROM announcements ORDER BY is_pinned DESC, published_at DESC LIMIT 5`).all();
  const recentDocs = db.prepare(`SELECT document_id, document_name, document_type, created_at FROM documents ORDER BY created_at DESC LIMIT 6`).all();

  let pendingRequests = [];
  if (can(s.roleName, 'hrAdmin') || can(s.roleName, 'directory')) {
    pendingRequests = db.prepare(`
      SELECT request_id, subject, category, priority, status, created_at FROM hr_requests
      WHERE status IN ('Open','In Progress') ORDER BY created_at DESC LIMIT 8`).all();
  }

  return send(res, 200, {
    ok: true,
    stats: { totalEmployees, openHrRequests, pendingApprovals, employeesOnLeave: onLeave },
    headcountByDept, recentActivity, upcomingLeave, announcements, recentDocs, pendingRequests,
  });
}

// ---------------------------------------------------------------- employee directory

const SORTABLE = { name: 'e.last_name', department: 'd.name', joinDate: 'e.join_date', grade: 'e.job_grade', status: 'e.employment_status' };

function handleDirectoryList(req, res, { send }, searchParams, outerSession) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!can(s.roleName, 'directory')) return fail(send, res, 403, 'You do not have access to the employee directory.');
  const db = getDb();

  const search = (searchParams.get('search') || '').slice(0, 200);
  const department = searchParams.get('department') || '';
  const status = searchParams.get('status') || '';
  const type = searchParams.get('type') || '';
  const location = searchParams.get('location') || '';
  const grade = searchParams.get('grade') || '';
  const manager = searchParams.get('manager') || '';
  const sortKey = SORTABLE[searchParams.get('sort')] || 'e.last_name';
  const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const pageSize = [25, 50, 100].includes(parseInt(searchParams.get('pageSize'), 10)) ? parseInt(searchParams.get('pageSize'), 10) : 25;

  // Every dropdown filter is safely parameterized. The free-text `search` box is the one field
  // that gets pasted straight into the query -- a normal directory search feature, built the
  // unsafe way, same as a real one might be after a rushed migration.
  const where = ["(e.first_name || ' ' || e.last_name || ' ' || e.job_title || ' ' || d.name || ' ' || e.location || ' ' || e.employee_id) LIKE '%" + search + "%'"];
  const params = [];
  if (department) { where.push('d.name = ?'); params.push(department); }
  if (status) { where.push('e.employment_status = ?'); params.push(status); }
  if (type) { where.push('e.employment_type = ?'); params.push(type); }
  if (location) { where.push('e.location = ?'); params.push(location); }
  if (grade) { where.push('e.job_grade = ?'); params.push(grade); }
  if (manager) { where.push('e.manager_id = ?'); params.push(manager); }

  const baseSql = `FROM employees e
    JOIN departments d ON d.department_id = e.department_id
    LEFT JOIN employees m ON m.employee_id = e.manager_id
    WHERE ${where.join(' AND ')}`;

  // One query, not a COUNT(*) + a separate paginated SELECT: at this data volume, fetching every
  // matching row and paginating in application code is simpler than it sounds, and -- unlike two
  // queries with different column counts -- it means the query shape a UNION payload has to match
  // is the same shape every time, not two different ones depending on which query runs first.
  let allRows, queryError = null;
  try {
    allRows = db.prepare(`
      SELECT e.employee_id, e.first_name, e.last_name, e.preferred_name, e.job_title, d.name AS department,
             m.first_name AS managerFirst, m.last_name AS managerLast, e.location, e.employment_type,
             e.employment_status, e.join_date, e.job_grade
      ${baseSql}
      ORDER BY ${sortKey} ${dir}`).all(...params);
  } catch (e) { queryError = e; }

  if (queryError) return fail(send, res, 500, 'Search service is temporarily unavailable.');
  const total = allRows.length;
  const rows = allRows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  // A search that manipulates the query into returning rows outside the normal shape (via a
  // UNION, say) is the discovery signal for this layer -- checked generically by shape, not by
  // matching a specific payload string.
  const looksLikeDiscovery = rows.some((r) => !r.employee_id || String(r.employee_id).indexOf('SD-') !== 0);
  if (looksLikeDiscovery) CS.setFlag(db, outerSession.token, 'stage3_directory');

  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

// ---------------------------------------------------------------- employee profile

function handleProfile(req, res, { send }, employeeIdRaw, outerSession) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const employeeId = decodeURIComponent(employeeIdRaw).slice(0, 300);

  // Intentionally vulnerable identifier lookup: the id straight off the URL is pasted into the
  // WHERE clause. A normal profile view never notices; only deliberate manipulation of the id
  // segment does anything unusual.
  let row, queryError = null;
  try {
    row = db.prepare(`
      SELECT e.*, d.name AS department
      FROM employees e JOIN departments d ON d.department_id = e.department_id
      WHERE e.employee_id = '${employeeId}'`).get();
  } catch (e) { queryError = e; }

  if (queryError) return fail(send, res, 500, 'Unable to process your request.');
  if (!row) return fail(send, res, 404, 'Employee not found.');

  const isOwn = s.employeeId === row.employee_id;
  const isTeam = can(s.roleName, 'teamProfiles');
  const canViewAny = can(s.roleName, 'anyProfile');
  if (!isOwn && !isTeam && !canViewAny) return fail(send, res, 403, 'You do not have access to this profile.');

  const looksLikeDiscovery = !row.employee_id || String(row.employee_id).indexOf('SD-') !== 0;
  if (looksLikeDiscovery) CS.setFlag(db, outerSession.token, 'stage3_employee');

  const profile = db.prepare('SELECT * FROM employee_profiles WHERE employee_id = ?').get(row.employee_id) || {};
  const manager = row.manager_id ? employeeSummary(db, row.manager_id) : null;
  const directReports = db.prepare(`SELECT employee_id, first_name, last_name, job_title FROM employees WHERE manager_id = ?`).all(row.employee_id);
  const leave = db.prepare(`SELECT leave_type, start_date, end_date, days, status FROM leave_records WHERE employee_id = ? ORDER BY start_date DESC LIMIT 10`).all(row.employee_id);
  const reviews = can(s.roleName, 'anyProfile') || isOwn || isTeam
    ? db.prepare(`SELECT review_period, rating, summary, goals FROM performance_reviews WHERE employee_id = ? ORDER BY created_at DESC LIMIT 5`).all(row.employee_id)
    : [];
  const docs = db.prepare(`SELECT document_id, document_name, document_type, classification, created_at FROM documents WHERE employee_id = ?`).all(row.employee_id);

  return send(res, 200, {
    ok: true,
    employee: row, profile, manager, directReports, leave, reviews, documents: docs,
    access: { canViewPayroll: can(s.roleName, 'payroll') },
  });
}

// ---------------------------------------------------------------- organization

function handleOrganization(req, res, { send }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const rows = db.prepare(`
    SELECT e.employee_id, e.first_name, e.last_name, e.job_title, e.manager_id, d.name AS department
    FROM employees e JOIN departments d ON d.department_id = e.department_id
    WHERE e.employment_status != 'Inactive'`).all();
  return send(res, 200, { ok: true, employees: rows });
}

// ---------------------------------------------------------------- notifications

function handleNotifications(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!s.employeeId) return send(res, 200, { ok: true, results: [] });
  const db = getDb();
  const pageSize = Math.min(50, parseInt(searchParams.get('pageSize'), 10) || 20);
  const rows = db.prepare(`SELECT notification_id, message, type, is_read, created_at FROM notifications
    WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?`).all(s.employeeId, pageSize);
  return send(res, 200, { ok: true, results: rows });
}

function handleMarkAllRead(req, res, { send }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (s.employeeId) getDb().prepare('UPDATE notifications SET is_read = 1 WHERE employee_id = ?').run(s.employeeId);
  return send(res, 200, { ok: true });
}

// ---------------------------------------------------------------- global search

function handleSearch(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const q = (searchParams.get('q') || '').slice(0, 100);
  if (!q) return send(res, 200, { ok: true, groups: [] });
  const like = '%' + q.replace(/[%_]/g, '') + '%';
  const groups = [];

  if (can(s.roleName, 'directory')) {
    const emps = db.prepare(`SELECT employee_id, first_name, last_name, job_title FROM employees
      WHERE (first_name || ' ' || last_name) LIKE ? OR job_title LIKE ? LIMIT 6`).all(like, like);
    if (emps.length) groups.push({ label: 'Employees', items: emps.map((e) => ({ title: e.first_name + ' ' + e.last_name, subtitle: e.job_title, href: 'employee-profile.html?id=' + e.employee_id })) });
  }
  const docs = db.prepare(`SELECT document_id, document_name, document_type FROM documents WHERE document_name LIKE ? LIMIT 6`).all(like);
  if (docs.length) groups.push({ label: 'Documents', items: docs.map((d) => ({ title: d.document_name, subtitle: d.document_type, href: 'documents.html?id=' + d.document_id })) });

  const reqs = db.prepare(`SELECT request_id, subject, category FROM hr_requests WHERE subject LIKE ? LIMIT 6`).all(like);
  if (reqs.length) groups.push({ label: 'Requests', items: reqs.map((r) => ({ title: r.subject, subtitle: r.category, href: 'hr-requests.html?id=' + r.request_id })) });

  const ann = db.prepare(`SELECT announcement_id, title FROM announcements WHERE title LIKE ? LIMIT 6`).all(like);
  if (ann.length) groups.push({ label: 'Announcements', items: ann.map((a) => ({ title: a.title, subtitle: '', href: 'announcements.html?id=' + a.announcement_id })) });

  return send(res, 200, { ok: true, groups });
}

// ---------------------------------------------------------------- filter metadata

function handleMeta(req, res, { send }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const col = (table, column) => db.prepare(`SELECT DISTINCT ${column} v FROM ${table} WHERE ${column} IS NOT NULL ORDER BY ${column}`).all().map((r) => r.v);
  return send(res, 200, {
    ok: true,
    departments: db.prepare('SELECT name FROM departments ORDER BY name').all().map((r) => r.name),
    statuses: col('employees', 'employment_status'),
    employmentTypes: col('employees', 'employment_type'),
    locations: col('employees', 'location'),
    grades: col('employees', 'job_grade'),
    managers: db.prepare(`SELECT DISTINCT e.employee_id, e.first_name, e.last_name FROM employees e
      WHERE e.employee_id IN (SELECT DISTINCT manager_id FROM employees WHERE manager_id IS NOT NULL) ORDER BY e.last_name`).all(),
  });
}

// ---------------------------------------------------------------- dispatcher

async function handle(req, res, pathname, searchParams, helpers, outerSession) {
  const { send } = helpers;
  const method = req.method;

  if (method === 'POST' && pathname === '/api/peoplehub/auth/login') return handleLogin(req, res, helpers, outerSession);
  if (method === 'POST' && pathname === '/api/peoplehub/auth/logout') return handleLogout(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/me') return handleMe(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/dashboard') return handleDashboard(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/employees') return handleDirectoryList(req, res, helpers, searchParams, outerSession);
  if (method === 'GET' && pathname === '/api/peoplehub/organization') return handleOrganization(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/notifications') return handleNotifications(req, res, helpers, searchParams);
  if (method === 'POST' && pathname === '/api/peoplehub/notifications/mark-all-read') return handleMarkAllRead(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/search') return handleSearch(req, res, helpers, searchParams);
  if (method === 'GET' && pathname === '/api/peoplehub/meta') return handleMeta(req, res, helpers);

  const profileMatch = /^\/api\/peoplehub\/employees\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && profileMatch) return handleProfile(req, res, helpers, profileMatch[1], outerSession);

  // ----- Time & Pay -----
  if (method === 'GET' && pathname === '/api/peoplehub/leave') return TimePay.handleLeaveList(req, res, helpers, searchParams);
  if (method === 'POST' && pathname === '/api/peoplehub/leave') return TimePay.handleLeaveCreate(req, res, helpers);
  const payrollMatch = /^\/api\/peoplehub\/payroll\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && payrollMatch) return TimePay.handlePayroll(req, res, helpers, payrollMatch[1]);

  // ----- Documents -----
  if (method === 'GET' && pathname === '/api/peoplehub/documents') return Documents.handleList(req, res, helpers, searchParams);
  const docMatch = /^\/api\/peoplehub\/documents\/(\d+)$/.exec(pathname);
  if (method === 'GET' && docMatch) return Documents.handleDetail(req, res, helpers, docMatch[1], outerSession);

  // ----- HR / IT requests -----
  if (method === 'GET' && pathname === '/api/peoplehub/hr-requests') return Requests.handleHrList(req, res, helpers, searchParams, outerSession);
  if (method === 'POST' && pathname === '/api/peoplehub/hr-requests') return Requests.handleHrCreate(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/it-tickets') return Requests.handleItList(req, res, helpers, searchParams);
  if (method === 'POST' && pathname === '/api/peoplehub/it-tickets') return Requests.handleItCreate(req, res, helpers);

  // ----- Reports -----
  if (method === 'GET' && pathname === '/api/peoplehub/reports') return Reports.handleList(req, res, helpers);
  const reportRunMatch = /^\/api\/peoplehub\/reports\/(\d+)\/run$/.exec(pathname);
  if (method === 'GET' && reportRunMatch) return Reports.handleRun(req, res, helpers, reportRunMatch[1], searchParams, outerSession);

  // ----- Recruitment -----
  if (method === 'GET' && pathname === '/api/peoplehub/job-openings') return Recruitment.handleJobs(req, res, helpers, searchParams);
  if (method === 'GET' && pathname === '/api/peoplehub/candidates') return Recruitment.handleCandidates(req, res, helpers, searchParams);
  if (method === 'GET' && pathname === '/api/peoplehub/applications') return Recruitment.handleApplications(req, res, helpers, searchParams);

  // ----- Training -----
  if (method === 'GET' && pathname === '/api/peoplehub/training-courses') return Training.handleCourses(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/training-enrollments') return Training.handleEnrollments(req, res, helpers, searchParams);

  // ----- Announcements / Policies -----
  if (method === 'GET' && pathname === '/api/peoplehub/announcements') return Comms.handleAnnouncements(req, res, helpers, searchParams);
  if (method === 'GET' && pathname === '/api/peoplehub/policies') return Comms.handlePolicies(req, res, helpers);

  // ----- Audit / Security -----
  if (method === 'GET' && pathname === '/api/peoplehub/audit-logs') return Audit.handleAuditLogs(req, res, helpers, searchParams);
  if (method === 'GET' && pathname === '/api/peoplehub/security-events') return Audit.handleSecurityEvents(req, res, helpers, searchParams);

  // ----- Administration -----
  if (method === 'GET' && pathname === '/api/peoplehub/admin/users') return Admin.handleUsers(req, res, helpers, searchParams);
  if (method === 'GET' && pathname === '/api/peoplehub/admin/roles') return Admin.handleRoles(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/admin/departments') return Admin.handleDepartments(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/admin/import-jobs') return Admin.handleImportJobs(req, res, helpers, searchParams);

  // ----- Employee Data Import (XML / XXE) -----
  if (method === 'POST' && pathname === '/api/peoplehub/import/validate') return ImportXml.handleValidate(req, res, helpers, outerSession);
  if (method === 'POST' && pathname === '/api/peoplehub/import/process') return ImportXml.handleProcess(req, res, helpers, outerSession);
  if (method === 'GET' && pathname === '/api/peoplehub/import/history') return ImportXml.handleHistory(req, res, helpers, searchParams);

  // ----- Employee Feedback (stored XSS) -----
  if (method === 'GET' && pathname === '/api/peoplehub/feedback/token') return Feedback.handleToken(req, res, helpers, outerSession);
  if (method === 'POST' && pathname === '/api/peoplehub/feedback') return Feedback.handleSubmit(req, res, helpers);
  if (method === 'GET' && pathname === '/api/peoplehub/feedback') return Feedback.handleList(req, res, helpers, searchParams);
  if (method === 'POST' && pathname === '/api/peoplehub/feedback/capture') return Feedback.handleCapture(req, res, helpers, outerSession);

  // ----- Emergency Access -----
  if (method === 'GET' && pathname === '/api/peoplehub/emergency-access') return Emergency.handleList(req, res, helpers, searchParams);
  if (method === 'POST' && pathname === '/api/peoplehub/emergency-access') return Emergency.handleCreate(req, res, helpers, outerSession);
  const eaApproveMatch = /^\/api\/peoplehub\/emergency-access\/(\d+)\/approve$/.exec(pathname);
  if (method === 'POST' && eaApproveMatch) return Emergency.handleApprove(req, res, helpers, eaApproveMatch[1]);

  return fail(send, res, 404, 'Not found.');
}

// ---------------------------------------------------------------- dev-only admin panel
const path = require('path');
const { execFile } = require('child_process');
const { closeDb } = require('./db');

async function handleAdmin(req, res, pathname, searchParams, helpers) {
  const { send } = helpers;

  if (req.method === 'GET' && pathname === '/api/ctf-admin/state') {
    const rows = getDb().prepare('SELECT * FROM challenge_state WHERE session_key != ?').all('_template');
    return send(res, 200, { ok: true, sessions: rows });
  }
  if (req.method === 'POST' && pathname === '/api/ctf-admin/reset-progress') {
    getDb().exec("DELETE FROM challenge_state WHERE session_key != '_template'");
    return send(res, 200, { ok: true, message: 'All challenge progress rows cleared.' });
  }
  if (req.method === 'POST' && pathname === '/api/ctf-admin/reset-phsessions') {
    PH.destroyAll();
    return send(res, 200, { ok: true, message: 'All PeopleHub login sessions cleared.' });
  }
  if (req.method === 'POST' && pathname === '/api/ctf-admin/reset-database') {
    // Closes this process's handle on the sqlite file, runs the deterministic seed script fresh
    // (same seed in, same base data out), then reopens on the next query. Takes ~30-60s; the
    // request just waits on it rather than blocking the rest of the server, since child_process
    // is async.
    closeDb();
    const seedPath = path.join(__dirname, '..', '..', 'seed', 'seed.js');
    execFile(process.execPath, [seedPath], { cwd: path.join(__dirname, '..', '..', '..'), timeout: 180000 }, (err, stdout, stderr) => {
      if (err) return send(res, 500, { ok: false, error: 'Reseed failed: ' + err.message, stderr });
      return send(res, 200, { ok: true, message: 'Database reset and reseeded from scratch.', output: stdout });
    });
    return; // response sent from the execFile callback
  }
  return send(res, 404, { ok: false, error: 'Not found.' });
}

module.exports = { handle, handleAdmin };
