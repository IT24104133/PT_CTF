// Employee Feedback -> HR Review Queue. The submission itself is safely stored; the bug is in
// how the review queue is *rendered* (the frontend does `el.innerHTML = message`, unescaped, on
// purpose) -- a stored-XSS lab, same shape as the original. A synthetic per-outer-session admin
// token is handed out once (c-token) and never appears anywhere except that one JS global on
// this page, so the only way to get it is to make the review queue's render step leak it out --
// exactly the point of the exercise.
'use strict';
const crypto = require('crypto');
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const CS = require('../challengeState');

const tokensByOuterSession = new Map(); // outerSession.token -> synthetic admin session token

function handleToken(req, res, { send }, outerSession) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!tokensByOuterSession.has(outerSession.token)) {
    tokensByOuterSession.set(outerSession.token, crypto.randomBytes(16).toString('hex'));
  }
  return send(res, 200, { ok: true, token: tokensByOuterSession.get(outerSession.token) });
}

async function handleSubmit(req, res, { send, readJson }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  let body;
  try { body = await readJson(req, 4096); } catch (e) { return fail(send, res, 400, 'Invalid request.'); }
  const message = body && typeof body.message === 'string' ? body.message.slice(0, 2000) : '';
  if (!message.trim()) return fail(send, res, 400, 'Feedback message is required.');
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS employee_feedback (feedback_id INTEGER PRIMARY KEY, employee_id TEXT, message TEXT, created_at TEXT)`);
  const nextId = (db.prepare('SELECT MAX(feedback_id) m FROM employee_feedback').get().m || 0) + 1;
  db.prepare('INSERT INTO employee_feedback (feedback_id, employee_id, message, created_at) VALUES (?,?,?,?)')
    .run(nextId, s.employeeId || null, message, new Date().toISOString());
  return send(res, 200, { ok: true, message: 'Thanks -- your feedback has been sent to HR.' });
}

function handleList(req, res, { send }, searchParams) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS employee_feedback (feedback_id INTEGER PRIMARY KEY, employee_id TEXT, message TEXT, created_at TEXT)`);
  const { page, pageSize, offset } = pagination(searchParams, [10, 25]);
  const rows = db.prepare('SELECT feedback_id, employee_id, message, created_at FROM employee_feedback ORDER BY created_at DESC LIMIT ? OFFSET ?').all(pageSize, offset);
  return send(res, 200, { ok: true, results: rows });
}

function handleCapture(req, res, { send, readJson }, outerSession) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  return readJson(req, 512).then((body) => {
    const given = body && typeof body.token === 'string' ? body.token : '';
    const expected = tokensByOuterSession.get(outerSession.token);
    const captured = !!(expected && given === expected);
    if (captured) CS.setFlag(getDb(), outerSession.token, 'stage3_xss');
    return send(res, 200, { ok: true, captured });
  }).catch(() => fail(send, res, 400, 'Invalid request.'));
}

module.exports = { handleToken, handleSubmit, handleList, handleCapture };
