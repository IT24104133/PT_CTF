// Audit Log + Security Events -- Security/Administrator only.
'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');

function handleAuditLogs(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!can(s.roleName, 'audit')) return fail(send, res, 403, 'You do not have access to the audit log.');
  const db = getDb();
  const action = searchParams.get('action') || '';
  const { page, pageSize, offset } = pagination(searchParams, [25, 50, 100]);
  const where = action ? 'WHERE a.action = ?' : '';
  const params = action ? [action] : [];
  const total = db.prepare(`SELECT COUNT(*) n FROM audit_logs a ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT a.audit_id, a.timestamp, u.username, a.action, a.resource_type, a.resource_id, a.ip_address, a.result
    FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id ${where}
    ORDER BY a.timestamp DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

function handleSecurityEvents(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!can(s.roleName, 'security')) return fail(send, res, 403, 'You do not have access to security events.');
  const db = getDb();
  const { page, pageSize, offset } = pagination(searchParams, [25, 50, 100]);
  const total = db.prepare('SELECT COUNT(*) n FROM security_events').get().n;
  const rows = db.prepare(`SELECT se.event_id, se.timestamp, e.first_name, e.last_name, se.event_type, se.detail, se.ip_address, se.severity
    FROM security_events se LEFT JOIN employees e ON e.employee_id = se.employee_id
    ORDER BY se.timestamp DESC LIMIT ? OFFSET ?`).all(pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

module.exports = { handleAuditLogs, handleSecurityEvents };
