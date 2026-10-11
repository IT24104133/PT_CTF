// Leave & Attendance + Payroll. Both are strictly parameterized (no intentional vulnerability
// here -- those live in directory/profile/reports/requests instead).
'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');

function scopeToEmployeeIds(db, s) {
  // Employee sees only their own records; Manager sees their direct team too; HR/Admin see all.
  if (can(s.roleName, 'hrAdmin') || can(s.roleName, 'admin') || can(s.roleName, 'payroll')) return null; // null = no restriction
  if (s.roleName === 'Manager' && s.employeeId) {
    const reports = db.prepare('SELECT employee_id FROM employees WHERE manager_id = ?').all(s.employeeId).map((r) => r.employee_id);
    return [s.employeeId, ...reports];
  }
  return s.employeeId ? [s.employeeId] : [];
}

function handleLeaveList(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const scope = scopeToEmployeeIds(db, s);
  if (scope && !scope.length) return send(res, 200, { ok: true, total: 0, results: [] });

  const status = searchParams.get('status') || '';
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const where = [];
  const params = [];
  if (scope) { where.push(`l.employee_id IN (${scope.map(() => '?').join(',')})`); params.push(...scope); }
  if (status) { where.push('l.status = ?'); params.push(status); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) n FROM leave_records l ${whereSql}`).get(...params).n;
  const rows = db.prepare(`
    SELECT l.leave_id, l.employee_id, e.first_name, e.last_name, l.leave_type, l.start_date, l.end_date, l.days, l.status, l.reason
    FROM leave_records l JOIN employees e ON e.employee_id = l.employee_id
    ${whereSql} ORDER BY l.start_date DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);

  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

async function handleLeaveCreate(req, res, { send, readJson }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!s.employeeId) return fail(send, res, 400, 'No employee record linked to this account.');
  let body;
  try { body = await readJson(req, 2048); } catch (e) { return fail(send, res, 400, 'Invalid request.'); }
  const db = getDb();
  const type = String((body && body.leaveType) || 'Annual Leave').slice(0, 40);
  const start = String((body && body.startDate) || '').slice(0, 20);
  const end = String((body && body.endDate) || '').slice(0, 20);
  const reason = body && body.reason ? String(body.reason).slice(0, 500) : null;
  if (!start || !end) return fail(send, res, 400, 'Start and end dates are required.');
  const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
  const nextId = (db.prepare('SELECT MAX(leave_id) m FROM leave_records').get().m || 0) + 1;
  db.prepare(`INSERT INTO leave_records (leave_id, employee_id, leave_type, start_date, end_date, days, status, approved_by, reason, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(nextId, s.employeeId, type, start, end, days, 'Pending', null, reason, new Date().toISOString());
  return send(res, 200, { ok: true, message: 'Your leave request has been submitted.' });
}

function handlePayroll(req, res, { send }, employeeId) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const id = decodeURIComponent(employeeId);
  const isOwn = s.employeeId === id;
  if (!isOwn && !can(s.roleName, 'payroll')) return fail(send, res, 403, 'You do not have access to payroll information.');
  const db = getDb();
  const row = db.prepare(`SELECT p.*, e.first_name, e.last_name, e.job_title FROM payroll p
    JOIN employees e ON e.employee_id = p.employee_id WHERE p.employee_id = ?`).get(id);
  if (!row) return fail(send, res, 404, 'No payroll record found.');
  return send(res, 200, { ok: true, payroll: row });
}

module.exports = { handleLeaveList, handleLeaveCreate, handlePayroll };
