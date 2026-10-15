'use strict';
// Accounts, sessions and login throttling for the competition platform.

const crypto = require('node:crypto');
const { stmt, transaction, getSetting } = require('./db');
const { hashPassword, verifyPassword, verifyAgainstDummy } = require('./passwords');

const USERNAME_RE = /^[A-Za-z0-9_-]{3,24}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const COMMON_PASSWORDS = new Set([
  'password123', 'password1234', '1234567890', 'qwerty12345', 'letmein1234', 'welcome1234',
  'iloveyou123', 'admin123456', 'abc1234567', 'passw0rd123', 'solstice123', 'changeme123',
]);

const SESSION_SHORT_MS = 12 * 60 * 60 * 1000;
const SESSION_REMEMBER_MS = 14 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

const COOKIE_NAME = 'pid';

// ---------------------------------------------------------------- rate limiting
// Failures are counted in memory per bucket. Several buckets together keep one person from
// guessing passwords, without letting a stranger lock a victim out from everywhere.
const buckets = new Map(); // key -> number[] (timestamps)

function bucketWait(key, max, windowMs, now) {
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  buckets.set(key, hits);
  if (hits.length >= max) return Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
  return 0;
}

function bucketHit(key, now) {
  const hits = buckets.get(key) || [];
  hits.push(now);
  buckets.set(key, hits);
}

const LOGIN_LIMITS = [
  (ip, id) => ({ key: 'login-ip:' + ip, max: 12, windowMs: 5 * 60 * 1000 }),
  (ip, id) => ({ key: 'login-pair:' + ip + '|' + id, max: 5, windowMs: 10 * 60 * 1000 }),
  (ip, id) => ({ key: 'login-id:' + id, max: 25, windowMs: 15 * 60 * 1000 }),
];

function loginWait(ip, identifier, now = Date.now()) {
  let wait = 0;
  for (const make of LOGIN_LIMITS) {
    const b = make(ip, identifier);
    wait = Math.max(wait, bucketWait(b.key, b.max, b.windowMs, now));
  }
  return wait;
}

function recordLoginFailure(ip, identifier, now = Date.now()) {
  for (const make of LOGIN_LIMITS) bucketHit(make(ip, identifier).key, now);
}

function clearLoginFailures(ip, identifier) {
  buckets.delete('login-pair:' + ip + '|' + identifier);
  buckets.delete('login-id:' + identifier);
}

function registerWait(ip, now = Date.now()) {
  return bucketWait('register-ip:' + ip, 10, 60 * 60 * 1000, now);
}

function recordRegistration(ip, now = Date.now()) {
  bucketHit('register-ip:' + ip, now);
}

function sweepBuckets(now = Date.now()) {
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < 60 * 60 * 1000);
    if (fresh.length) buckets.set(key, fresh); else buckets.delete(key);
  }
}

// ---------------------------------------------------------------- validation
function passwordProblem(password, username, email) {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 128) return 'Use at most 128 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'That password is too common.';
  const lower = password.toLowerCase();
  if (username && lower.includes(String(username).toLowerCase())) return 'Do not include your username in the password.';
  if (email && lower.includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length >= 4) {
    return 'Do not include your email name in the password.';
  }
  return null;
}

function validateRegistration(body) {
  const errors = {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirm = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!USERNAME_RE.test(username)) errors.username = 'Use 3 to 24 letters, numbers, underscores or hyphens.';
  if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  const pwProblem = passwordProblem(password, username, email);
  if (pwProblem) errors.password = pwProblem;
  if (!errors.password && password !== confirm) errors.confirmPassword = 'The passwords do not match.';
  return { errors, username, email, password };
}

// ---------------------------------------------------------------- users
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id, username: row.username, email: row.email, role: row.role, status: row.account_status,
    createdAt: row.created_at, lastLoginAt: row.last_login_at,
  };
}

function logEvent(userId, type, detail, now = Date.now()) {
  stmt('INSERT INTO player_events (user_id, type, detail, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, type, detail || null, now);
}

function registrationOpen() {
  return getSetting('registration_open', '1') === '1';
}

// Public sign-up only ever creates USER accounts; admins come from createAdmin().
async function register(body, ip) {
  if (!registrationOpen()) return { ok: false, status: 403, error: 'Registration is currently closed.' };
  const { errors, username, email, password } = validateRegistration(body || {});
  if (Object.keys(errors).length) return { ok: false, status: 400, errors, error: 'Please fix the highlighted fields.' };

  const wait = registerWait(ip);
  if (wait) return { ok: false, status: 429, retryAfter: wait, error: 'Too many registrations from this address. Try again later.' };

  const taken = {};
  if (stmt('SELECT 1 FROM users WHERE username = ?').get(username)) taken.username = 'That username is already taken.';
  if (stmt('SELECT 1 FROM users WHERE email = ?').get(email)) taken.email = 'An account with that email already exists.';
  if (Object.keys(taken).length) return { ok: false, status: 409, errors: taken, error: 'Please fix the highlighted fields.' };

  const passwordHash = await hashPassword(password);
  const now = Date.now();
  try {
    const user = transaction(() => {
      const result = stmt(`INSERT INTO users (username, email, password_hash, role, account_status, created_at)
        VALUES (?, ?, ?, 'user', 'active', ?)`).run(username, email, passwordHash, now);
      const id = Number(result.lastInsertRowid);
      stmt('INSERT INTO competition_progress (user_id) VALUES (?)').run(id);
      logEvent(id, 'registered', null, now);
      return stmt('SELECT * FROM users WHERE id = ?').get(id);
    });
    recordRegistration(ip, now);
    return { ok: true, user: publicUser(user) };
  } catch (error) {
    // Two simultaneous sign-ups can race past the checks above; the UNIQUE constraints decide.
    if (/UNIQUE/i.test(String(error && error.message))) {
      return { ok: false, status: 409, errors: { username: 'That username or email is already registered.' }, error: 'Please fix the highlighted fields.' };
    }
    throw error;
  }
}

// Used by the bootstrap script and the ADMIN_BOOTSTRAP_* start-up path, never by a public route.
async function createAdmin({ username, email, password }) {
  const { errors } = validateRegistration({ username, email, password, confirmPassword: password });
  if (Object.keys(errors).length) {
    throw new Error('Invalid admin details: ' + Object.values(errors).join(' '));
  }
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  return transaction(() => {
    const result = stmt(`INSERT INTO users (username, email, password_hash, role, account_status, created_at)
      VALUES (?, ?, ?, 'admin', 'active', ?)`).run(String(username).trim(), String(email).trim().toLowerCase(), passwordHash, now);
    const id = Number(result.lastInsertRowid);
    stmt('INSERT INTO admin_audit_logs (admin_id, action, target_user_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'admin.created', id, 'Bootstrap', now);
    return id;
  });
}

function adminExists() {
  return !!stmt("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
}

// ---------------------------------------------------------------- sessions
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(userId, remember, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = remember ? SESSION_REMEMBER_MS : SESSION_SHORT_MS;
  stmt('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, remember) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hashToken(token), userId, now, now + ttl, now, remember ? 1 : 0);
  return { token, maxAgeSeconds: remember ? Math.floor(SESSION_REMEMBER_MS / 1000) : null };
}

function tokenFromRequest(req) {
  const m = /(?:^|;\s*)pid=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}

function userForToken(token, now = Date.now()) {
  if (!token) return null;
  const hash = hashToken(token);
  const row = stmt(`SELECT u.*, s.expires_at AS session_expires, s.last_seen_at AS session_seen
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(hash);
  if (!row) return null;
  if (row.session_expires <= now) {
    stmt('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    return null;
  }
  if (row.account_status === 'suspended') return null;
  if (now - row.session_seen > TOUCH_INTERVAL_MS) {
    stmt('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, hash);
  }
  return publicUser(row);
}

function userFromRequest(req) {
  return userForToken(tokenFromRequest(req));
}

function destroySession(token) {
  if (token) stmt('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

function destroyUserSessions(userId, exceptToken) {
  if (exceptToken) {
    stmt('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, hashToken(exceptToken));
  } else {
    stmt('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

function purgeExpiredSessions(now = Date.now()) {
  stmt('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}

// ---------------------------------------------------------------- login
async function login(body, ip) {
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier || !password || identifier.length > 254 || password.length > 256) {
    return { ok: false, status: 400, error: 'Enter your username or email and your password.' };
  }

  const wait = loginWait(ip, identifier);
  if (wait) return { ok: false, status: 429, retryAfter: wait, error: 'Too many attempts. Try again in ' + wait + 's.' };

  const row = stmt('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1').get(identifier, identifier);
  let valid = false;
  if (row) valid = await verifyPassword(password, row.password_hash);
  else await verifyAgainstDummy(password);

  if (!valid) {
    recordLoginFailure(ip, identifier);
    return { ok: false, status: 401, error: 'Invalid username or password.' };
  }
  if (row.account_status === 'suspended') {
    return { ok: false, status: 403, error: 'This account has been suspended. Contact an organiser.' };
  }

  clearLoginFailures(ip, identifier);
  const now = Date.now();
  stmt('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, row.id);
  const session = createSession(row.id, !!body.remember, now);
  if (row.role === 'admin') {
    stmt('INSERT INTO admin_audit_logs (admin_id, action, target_user_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)')
      .run(row.id, 'admin.login', row.id, null, now);
  } else {
    logEvent(row.id, 'login', null, now);
  }
  return { ok: true, user: publicUser({ ...row, last_login_at: now }), session };
}

async function changePassword(userId, currentPassword, newPassword, keepToken) {
  const row = stmt('SELECT * FROM users WHERE id = ?').get(userId);
  if (!row) return { ok: false, status: 404, error: 'Account not found.' };
  if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, row.password_hash))) {
    return { ok: false, status: 400, errors: { currentPassword: 'Your current password is not correct.' }, error: 'Your current password is not correct.' };
  }
  const problem = passwordProblem(newPassword, row.username, row.email);
  if (problem) return { ok: false, status: 400, errors: { newPassword: problem }, error: problem };
  const hash = await hashPassword(newPassword);
  stmt('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  destroyUserSessions(userId, keepToken);
  return { ok: true };
}

module.exports = {
  COOKIE_NAME, USERNAME_RE, validateRegistration, passwordProblem, register, createAdmin, adminExists,
  login, changePassword, createSession, tokenFromRequest, userFromRequest, userForToken, destroySession,
  destroyUserSessions, purgeExpiredSessions, publicUser, logEvent, registrationOpen, sweepBuckets,
};
