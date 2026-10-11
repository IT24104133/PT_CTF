// Documents. The list view is correctly scoped (your own documents + company-wide ones only) --
// that's the realistic part of this bug class: browsing normally, everything looks properly
// locked down. The detail/download route is where the authorization check is incomplete: it only
// checks the document's classification against the caller's role (a real, legitimate check that
// was clearly written on purpose) and never separately checks whether the document actually
// belongs to the caller. A personal document type (Employment Contract, Compensation Letter,
// Performance Review, Leave Approval) that happens to be classified "Internal" -- which every
// role can view -- is then reachable for *any* employee_id, not just your own, simply by knowing
// or guessing another document's id. That's the actual bug: two authorization checks that look
// related (classification, ownership) where only one of them got implemented.
'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');
const CS = require('../challengeState');

const PERSONAL_TYPES = new Set(['Employment Contract', 'Compensation Letter', 'Performance Review', 'Leave Approval', 'Onboarding', 'Offboarding', 'Benefits', 'Training']);

function handleList(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const search = (searchParams.get('search') || '').slice(0, 200);
  const type = searchParams.get('type') || '';
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);

  const where = ['(d.employee_id IS NULL OR d.employee_id = ?)'];
  const params = [s.employeeId || ''];
  if (can(s.roleName, 'hrAdmin') || can(s.roleName, 'admin')) { where[0] = '1=1'; params.length = 0; } // HR/Admin browse everyone's, through the (safe) list view
  if (search) { where.push('d.document_name LIKE ?'); params.push('%' + search + '%'); }
  if (type) { where.push('d.document_type = ?'); params.push(type); }
  const whereSql = 'WHERE ' + where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) n FROM documents d ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT d.document_id, d.document_name, d.document_type, d.classification, d.employee_id, d.created_at
    FROM documents d ${whereSql} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

function handleDetail(req, res, { send }, docIdRaw, outerSession) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const docId = parseInt(docIdRaw, 10);
  if (!docId) return fail(send, res, 404, 'Document not found.');

  const doc = db.prepare(`SELECT d.*, e.first_name, e.last_name FROM documents d
    LEFT JOIN employees e ON e.employee_id = d.employee_id WHERE d.document_id = ?`).get(docId);
  if (!doc) return fail(send, res, 404, 'Document not found.');

  // The one real check this route performs: does this role have view rights for this
  // classification at all? Public/Internal are broadly granted; Confidential/Restricted are not.
  const grant = db.prepare('SELECT 1 FROM document_access WHERE document_id = ? AND role_id = ?').get(docId, s.roleId);
  if (!grant) return fail(send, res, 403, 'You do not have access to this document.');

  const isOwnOrShared = !doc.employee_id || doc.employee_id === s.employeeId;
  if (!isOwnOrShared && PERSONAL_TYPES.has(doc.document_type) && !can(s.roleName, 'hrAdmin') && !can(s.roleName, 'admin')) {
    // This is the actual discovery signal for this layer: a personal document belonging to
    // someone else, reached only because the classification check happened to allow it.
    CS.setFlag(db, outerSession.token, 'stage3_document');
  }

  return send(res, 200, {
    ok: true,
    document: {
      document_id: doc.document_id, document_name: doc.document_name, document_type: doc.document_type,
      classification: doc.classification, storage_path: doc.storage_path, body_excerpt: doc.body_excerpt,
      created_at: doc.created_at, owner: doc.employee_id ? { employee_id: doc.employee_id, name: doc.first_name + ' ' + doc.last_name } : null,
    },
  });
}

module.exports = { handleList, handleDetail };
