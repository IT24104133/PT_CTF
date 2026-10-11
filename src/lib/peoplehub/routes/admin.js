// Administration: Users, Roles, Departments, Import Jobs -- Administrator only.
'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');

function guardAdmin(req, send, res) {
  const s = requirePhAuth(req);
  if (!s) { fail(send, res, 401, 'Not signed in.'); return null; }
  if (!can(s.roleName, 'admin')) { fail(send, res, 403, 'You do not have access to Administration.'); return null; }
  return s;
}

function handleUsers(req, res, { send }, searchParams) {
  if (!guardAdmin(req, send, res)) return;
  const db = getDb();
  const { page, pageSize, offset } = pagination(searchParams, [25, 50, 100]);
  const total = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const rows = db.prepare(`SELECT u.user_id, u.username, r.name AS role, u.employee_id, e.first_name, e.last_name, u.is_active, u.last_login_at
    FROM users u JOIN roles r ON r.role_id = u.role_id LEFT JOIN employees e ON e.employee_id = u.employee_id
    ORDER BY u.user_id LIMIT ? OFFSET ?`).all(pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

function handleRoles(req, res, { send }) {
  if (!guardAdmin(req, send, res)) return;
  const db = getDb();
  const rows = db.prepare(`SELECT r.role_id, r.name, r.description, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.role_id) AS userCount
    FROM roles r ORDER BY r.role_id`).all();
  return send(res, 200, { ok: true, results: rows });
}

function handleDepartments(req, res, { send }) {
  if (!guardAdmin(req, send, res)) return;
  const db = getDb();
  const rows = db.prepare(`SELECT d.department_id, d.name, (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.department_id) AS headcount
    FROM departments d ORDER BY d.name`).all();
  return send(res, 200, { ok: true, results: rows });
}

function handleImportJobs(req, res, { send }, searchParams) {
  if (!guardAdmin(req, send, res)) return;
  const db = getDb();
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const total = db.prepare('SELECT COUNT(*) n FROM import_jobs').get().n;
  const rows = db.prepare(`SELECT import_id, filename, status, records_processed, records_success, records_rejected, warnings, created_at
    FROM import_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

module.exports = { handleUsers, handleRoles, handleDepartments, handleImportJobs };
