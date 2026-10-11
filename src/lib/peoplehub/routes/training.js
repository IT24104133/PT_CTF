'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');

function handleCourses(req, res, { send }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const rows = db.prepare('SELECT course_id, name, description, is_mandatory FROM training_courses ORDER BY name').all();
  return send(res, 200, { ok: true, results: rows });
}

function handleEnrollments(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const status = searchParams.get('status') || '';
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const where = ['te.employee_id = ?'];
  const params = [s.employeeId || ''];
  if (can(s.roleName, 'hrAdmin') || can(s.roleName, 'admin')) { where[0] = '1=1'; params.length = 0; }
  if (status) { where.push('te.status = ?'); params.push(status); }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM training_enrollments te ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT te.enrollment_id, te.employee_id, e.first_name, e.last_name, c.name AS course, te.status, te.enrolled_at, te.completed_at
    FROM training_enrollments te JOIN training_courses c ON c.course_id = te.course_id JOIN employees e ON e.employee_id = te.employee_id
    ${whereSql} ORDER BY te.enrolled_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

module.exports = { handleCourses, handleEnrollments };
