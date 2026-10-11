// Announcements + Company Policies (policies are just Public-classified documents, filtered by
// document_type -- no separate table needed).
'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');

function handleAnnouncements(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const total = db.prepare('SELECT COUNT(*) n FROM announcements').get().n;
  const rows = db.prepare(`SELECT announcement_id, title, body, published_at, is_pinned FROM announcements
    ORDER BY is_pinned DESC, published_at DESC LIMIT ? OFFSET ?`).all(pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

function handlePolicies(req, res, { send }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  const rows = db.prepare(`SELECT document_id, document_name, body_excerpt, created_at FROM documents
    WHERE document_type = 'Policy' ORDER BY document_name`).all();
  return send(res, 200, { ok: true, results: rows });
}

module.exports = { handleAnnouncements, handlePolicies };
