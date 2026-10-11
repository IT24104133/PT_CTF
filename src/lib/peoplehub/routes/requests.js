// HR Requests (search is intentionally vulnerable -- section 33) and IT Tickets (safe, ordinary
// CRUD; no intended vulnerability there).
'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');
const CS = require('../challengeState');

function scopeClause(s, alias) {
  if (can(s.roleName, 'hrAdmin') || can(s.roleName, 'admin')) return null;
  return `${alias}.employee_id = '${s.employeeId || ''}'`; // caller's own id only, never attacker input
}

function handleHrList(req, res, { send }, searchParams, outerSession) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();

  const search = (searchParams.get('search') || '').slice(0, 200);
  const category = searchParams.get('category') || '';
  const status = searchParams.get('status') || '';
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);

  // `category`, `status`, and the employee-scoping clause are all safely parameterized. `search`
  // -- the box HR Helpdesk staff use to look a request up by subject, employee, or category text
  // -- is the one built by concatenation, matching a real "search request ID or subject" feature.
  const where = ["(hr.subject || ' ' || hr.category || ' ' || hr.description || ' ' || hr.employee_id) LIKE '%" + search + "%'"];
  const params = [];
  const scope = scopeClause(s, 'hr');
  if (scope) where.push(scope);
  if (category) { where.push('hr.category = ?'); params.push(category); }
  if (status) { where.push('hr.status = ?'); params.push(status); }
  const whereSql = 'WHERE ' + where.join(' AND ');

  // One query, paginated in application code -- see the matching comment in router.js's
  // handleDirectoryList for why (a separate COUNT(*) query has a different column count than
  // this one, which breaks any single UNION payload trying to satisfy both).
  let allRows, queryError = null;
  try {
    allRows = db.prepare(`
      SELECT hr.request_id, hr.employee_id, e.first_name, e.last_name, hr.category, hr.subject, hr.priority, hr.status, hr.created_at
      FROM hr_requests hr JOIN employees e ON e.employee_id = hr.employee_id
      ${whereSql} ORDER BY hr.created_at DESC`).all(...params);
  } catch (e) { queryError = e; }
  if (queryError) return fail(send, res, 500, 'Search service is temporarily unavailable.');
  const total = allRows.length;
  const rows = allRows.slice(offset, offset + pageSize);

  // Checking for a falsy value here isn't enough -- an attacker who fills every UNION column
  // with a harmless non-empty placeholder ('x') would still slip past a plain truthiness check.
  // Real request_ids are positive integers and real employee_ids always follow the SD-##### form.
  const looksLikeDiscovery = rows.some((r) => !Number.isInteger(r.request_id) || !/^SD-\d+$/.test(String(r.employee_id)));
  if (looksLikeDiscovery) CS.setFlag(db, outerSession.token, 'stage3_request');

  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

async function handleHrCreate(req, res, { send, readJson }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!s.employeeId) return fail(send, res, 400, 'No employee record linked to this account.');
  let body;
  try { body = await readJson(req, 4096); } catch (e) { return fail(send, res, 400, 'Invalid request.'); }
  const db = getDb();
  const category = String((body && body.category) || 'General').slice(0, 40);
  const subject = String((body && body.subject) || '').slice(0, 200);
  const description = body && body.description ? String(body.description).slice(0, 2000) : null;
  if (!subject) return fail(send, res, 400, 'Subject is required.');
  const nextId = (db.prepare('SELECT MAX(request_id) m FROM hr_requests').get().m || 0) + 1;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO hr_requests (request_id, employee_id, category, subject, description, priority, status, assigned_to, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(nextId, s.employeeId, category, subject, description, 'Normal', 'Open', null, now, now);
  return send(res, 200, { ok: true, message: 'Your request has been submitted.' });
}

function handleItList(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const category = searchParams.get('category') || '';
  const status = searchParams.get('status') || '';
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);

  const where = [];
  const params = [];
  if (!can(s.roleName, 'itAdmin') && !can(s.roleName, 'admin')) { where.push('t.employee_id = ?'); params.push(s.employeeId || ''); }
  if (category) { where.push('t.category = ?'); params.push(category); }
  if (status) { where.push('t.status = ?'); params.push(status); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) n FROM it_tickets t ${whereSql}`).get(...params).n;
  const rows = db.prepare(`
    SELECT t.ticket_id, t.employee_id, e.first_name, e.last_name, t.category, t.subject, t.priority, t.status, t.created_at
    FROM it_tickets t JOIN employees e ON e.employee_id = t.employee_id
    ${whereSql} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

async function handleItCreate(req, res, { send, readJson }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!s.employeeId) return fail(send, res, 400, 'No employee record linked to this account.');
  let body;
  try { body = await readJson(req, 4096); } catch (e) { return fail(send, res, 400, 'Invalid request.'); }
  const db = getDb();
  const category = String((body && body.category) || 'Software').slice(0, 40);
  const subject = String((body && body.subject) || '').slice(0, 200);
  const description = body && body.description ? String(body.description).slice(0, 2000) : null;
  if (!subject) return fail(send, res, 400, 'Subject is required.');
  const nextId = (db.prepare('SELECT MAX(ticket_id) m FROM it_tickets').get().m || 0) + 1;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO it_tickets (ticket_id, employee_id, category, subject, description, priority, status, assigned_to, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(nextId, s.employeeId, category, subject, description, 'Normal', 'Open', null, now, now);
  return send(res, 200, { ok: true, message: 'Your IT ticket has been submitted.' });
}

module.exports = { handleHrList, handleHrCreate, handleItList, handleItCreate };
