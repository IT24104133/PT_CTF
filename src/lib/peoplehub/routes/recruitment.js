'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');

function handleJobs(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const status = searchParams.get('status') || '';
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const where = status ? 'WHERE j.status = ?' : '';
  const params = status ? [status] : [];
  const total = db.prepare(`SELECT COUNT(*) n FROM job_openings j ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT j.job_id, j.title, d.name AS department, j.location, j.status, j.opened_at
    FROM job_openings j JOIN departments d ON d.department_id = j.department_id ${where}
    ORDER BY j.opened_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

function handleCandidates(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!can(s.roleName, 'recruitment')) return fail(send, res, 403, 'You do not have access to candidate records.');
  const db = getDb();
  const search = (searchParams.get('search') || '').slice(0, 100);
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const where = search ? 'WHERE c.full_name LIKE ?' : '';
  const params = search ? ['%' + search + '%'] : [];
  const total = db.prepare(`SELECT COUNT(*) n FROM candidates c ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT c.candidate_id, c.full_name, c.email, c.source, c.created_at,
      (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = c.candidate_id) AS applicationCount
    FROM candidates c ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

function handleApplications(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!can(s.roleName, 'recruitment')) return fail(send, res, 403, 'You do not have access to applications.');
  const db = getDb();
  const stage = searchParams.get('stage') || '';
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const where = stage ? 'WHERE a.stage = ?' : '';
  const params = stage ? [stage] : [];
  const total = db.prepare(`SELECT COUNT(*) n FROM applications a ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT a.application_id, c.full_name AS candidate, j.title AS job, a.stage, a.applied_at
    FROM applications a JOIN candidates c ON c.candidate_id = a.candidate_id JOIN job_openings j ON j.job_id = a.job_id
    ${where} ORDER BY a.applied_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

module.exports = { handleJobs, handleCandidates, handleApplications };
