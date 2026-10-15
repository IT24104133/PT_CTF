// PeopleHub's own login/session layer -- deliberately separate from the outer CTF's session
// (that one just gates whether this whole sub-application is reachable at all, via stage3).
// A PeopleHub session only proves "this browser is signed into the HR platform"; it carries no
// challenge-progress information itself. Challenge progress is tracked separately, keyed by the
// *outer* CTF session token, so it survives a PeopleHub logout/login cycle within the same run
// (see challengeState.js).
'use strict';
const crypto = require('crypto');

const TTL_MS = 60 * 60 * 1000;
const sessions = new Map(); // token -> { userId, username, employeeId, roleId, roleName, expires }

function create(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId: user.user_id, username: user.username, employeeId: user.employee_id,
    roleId: user.role_id, roleName: user.roleName, expires: Date.now() + TTL_MS,
  });
  return token;
}

function get(req) {
  const m = /(?:^|;\s*)phsid=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(m[1]); return null; }
  s.token = m[1];
  s.expires = Date.now() + TTL_MS; // sliding expiry on activity
  return s;
}

function destroy(token) { sessions.delete(token); }
function destroyAll() { sessions.clear(); }

function cookieHeader(token) {
  return 'phsid=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + (TTL_MS / 1000) + (process.env.COOKIE_SECURE === '1' ? '; Secure' : '');
}
function clearCookieHeader() {
  return 'phsid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + (process.env.COOKIE_SECURE === '1' ? '; Secure' : '');
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k);
}, 60 * 1000).unref();

module.exports = { create, get, destroy, destroyAll, cookieHeader, clearCookieHeader };
