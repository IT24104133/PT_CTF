// Security -> Emergency Access. This one isn't a coding bug -- it's a business-logic shortcut.
// The normal path is Draft -> Submitted -> Manager Approved -> Security Review -> HR Approved,
// each step requiring someone with approval rights. But the whole *point* of an emergency-access
// workflow is a break-glass path that skips the chain during an actual emergency -- and this one
// still honors an old cutover-era bypass code that documentation said should have been rotated
// (see the migration archive). Nothing on this page tells the player that; the connection is
// theirs to make between what they found in the XXE archive and what this form's "Emergency
// Access Code" field is for.
'use strict';
const crypto = require('crypto');
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');
const CS = require('../challengeState');

const BYPASS_CODE = 'BLACKOUT-7';
const CHAIN = ['Draft', 'Submitted', 'Manager Approved', 'Security Review', 'HR Approved'];

function sameSecret(a, b) {
  const ab = Buffer.from(String(a).toUpperCase());
  const bb = Buffer.from(String(b).toUpperCase());
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function handleList(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const scoped = !can(s.roleName, 'emergencyApprove') && !can(s.roleName, 'admin');
  const where = scoped ? 'WHERE ea.requested_by = ?' : '';
  const params = scoped ? [s.employeeId || ''] : [];
  const total = db.prepare(`SELECT COUNT(*) n FROM emergency_access_requests ea ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT ea.request_id, ea.reason, ea.access_type, ea.duration_hours, ea.status,
      e.first_name, e.last_name, ea.created_at, ea.updated_at
    FROM emergency_access_requests ea JOIN employees e ON e.employee_id = ea.employee_id
    ${where} ORDER BY ea.created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

async function handleCreate(req, res, { send, readJson }, outerSession) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!s.employeeId) return fail(send, res, 400, 'No employee record linked to this account.');
  let body;
  try { body = await readJson(req, 2048); } catch (e) { return fail(send, res, 400, 'Invalid request.'); }
  const db = getDb();
  const reason = String((body && body.reason) || '').slice(0, 500);
  const accessType = String((body && body.accessType) || 'Temporary System Access').slice(0, 60);
  const duration = [4, 8, 24, 48].includes(parseInt(body && body.duration, 10)) ? parseInt(body.duration, 10) : 8;
  const code = body && typeof body.code === 'string' ? body.code.trim() : '';
  if (!reason) return fail(send, res, 400, 'A reason is required.');

  const now = new Date().toISOString();
  const nextId = (db.prepare('SELECT MAX(request_id) m FROM emergency_access_requests').get().m || 0) + 1;

  const bypass = code && sameSecret(code, BYPASS_CODE);
  const status = bypass ? 'HR Approved' : 'Submitted';
  const approver = bypass ? s.employeeId : null;

  db.prepare(`INSERT INTO emergency_access_requests
    (request_id, employee_id, requested_by, reason, access_type, duration_hours, status,
     manager_approved_by, security_approved_by, hr_approved_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(nextId, s.employeeId, s.employeeId, reason, accessType, duration, status,
      bypass ? approver : null, bypass ? approver : null, bypass ? approver : null, now, now);

  if (bypass) CS.setFlag(db, outerSession.token, 'stage3_emergency');

  return send(res, 200, {
    ok: true,
    message: bypass
      ? 'Emergency access code accepted. Request approved immediately under the break-glass procedure.'
      : 'Request submitted. It will move through Manager, Security, and HR approval.',
    status,
  });
}

async function handleApprove(req, res, { send, readJson }, requestId) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!can(s.roleName, 'emergencyApprove')) return fail(send, res, 403, 'You do not have approval rights.');
  const db = getDb();
  const row = db.prepare('SELECT * FROM emergency_access_requests WHERE request_id = ?').get(requestId);
  if (!row) return fail(send, res, 404, 'Request not found.');
  const idx = CHAIN.indexOf(row.status);
  if (idx === -1 || idx >= CHAIN.length - 1) return fail(send, res, 400, 'This request cannot be advanced further.');
  const nextStatus = CHAIN[idx + 1];
  const col = nextStatus === 'Manager Approved' ? 'manager_approved_by' : nextStatus === 'Security Review' ? 'security_approved_by' : 'hr_approved_by';
  db.prepare(`UPDATE emergency_access_requests SET status = ?, ${col} = ?, updated_at = ? WHERE request_id = ?`)
    .run(nextStatus, s.employeeId, new Date().toISOString(), requestId);
  return send(res, 200, { ok: true, status: nextStatus });
}

module.exports = { handleList, handleCreate, handleApprove };
