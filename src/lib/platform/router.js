'use strict';
// HTTP surface of the competition platform: /api/platform/* plus the clean page routes.
// It is self-contained; server.js passes in the few things it owns (client IP, HTTPS detection,
// and the in-memory challenge sessions).

const fs = require('node:fs');
const path = require('node:path');
const auth = require('./auth');
const scoring = require('./scoring');
const admin = require('./admin');
const { getDb, closeDb } = require('./db');
const { CHALLENGES, TOTAL_POINTS } = require('./catalog');

const PAGES_DIR = path.join(__dirname, '..', '..', '..', 'public', 'platform');
const MAX_BODY = 16 * 1024;
const MAX_STREAMS = 400;

// The platform pages load nothing from other origins and run no inline script, so the policy
// can be enforced. It is not applied to the deliberately vulnerable challenge pages.
const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
};

let streams = 0;
let janitor = null;

// ---------------------------------------------------------------- cookies
// Embedded previews (an iframe on another site) need SameSite=None over HTTPS; the hosted
// competition uses Lax for the platform cookie and Strict for the challenge cookie.
function sameSiteAttr(secure, strict) {
  const mode = (process.env.COOKIE_SAMESITE || '').toLowerCase();
  if (mode === 'none') return secure ? '; SameSite=None; Partitioned' : '; SameSite=Lax';
  if (mode === 'lax') return '; SameSite=Lax';
  if (mode === 'strict') return '; SameSite=Strict';
  if (!mode && secure && process.env.NODE_ENV !== 'production') return '; SameSite=None; Partitioned';
  return strict ? '; SameSite=Strict' : '; SameSite=Lax';
}

function sessionCookie(req, ctx, token, maxAgeSeconds) {
  const secure = ctx.secure(req);
  return 'pid=' + token + '; HttpOnly; Path=/' + sameSiteAttr(secure, false) + (secure ? '; Secure' : '')
    + (maxAgeSeconds ? '; Max-Age=' + maxAgeSeconds : '');
}

function clearCookie(req, ctx) {
  const secure = ctx.secure(req);
  return 'pid=; HttpOnly; Path=/' + sameSiteAttr(secure, false) + (secure ? '; Secure' : '') + '; Max-Age=0';
}

// ---------------------------------------------------------------- helpers
function json(res, status, body, headers) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'content-length': Buffer.byteLength(text), ...(headers || {}),
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      } catch (e) { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

// State-changing requests must come from this site's own pages: JSON only, matching Origin,
// and never flagged cross-site by the browser.
function sameOriginOk(req) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.startsWith('application/json')) return false;
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return false; } catch (e) { return false; }
  }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

function intParam(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function sse(req, res) {
  if (streams >= MAX_STREAMS) return json(res, 503, { error: 'Too many live connections.' });
  streams += 1;
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform',
    connection: 'keep-alive', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff',
  });
  res.write('retry: 3000\n\n');
  const onChange = (event) => res.write('event: change\ndata: ' + JSON.stringify(event) + '\n\n');
  scoring.bus.on('change', onChange);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25000);
  req.on('close', () => {
    streams -= 1;
    clearInterval(heartbeat);
    scoring.bus.off('change', onChange);
  });
}

// ---------------------------------------------------------------- API
async function handleApi(req, res, url, ctx) {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/platform/')) return false;
  const route = pathname.slice('/api/platform'.length);
  const method = req.method;
  const query = url.searchParams;
  const user = auth.userFromRequest(req);
  const ip = ctx.clientIp(req);

  try {
    if (method === 'POST' && !sameOriginOk(req)) {
      return json(res, 403, { error: 'Cross-site request blocked.' }), true;
    }

    // ----- public
    if (method === 'GET' && route === '/config') {
      return json(res, 200, {
        registrationOpen: auth.registrationOpen(), challengeCount: CHALLENGES.length, maxScore: TOTAL_POINTS,
      }), true;
    }

    if (method === 'GET' && route === '/me') {
      return json(res, 200, user ? { authenticated: true, user: {
        username: user.username, email: user.email, role: user.role, status: user.status, createdAt: user.createdAt,
      } } : { authenticated: false }), true;
    }

    if (method === 'POST' && route === '/register') {
      const result = await auth.register(await readBody(req), ip);
      if (!result.ok) {
        return json(res, result.status, { ok: false, error: result.error, errors: result.errors || {} },
          result.retryAfter ? { 'retry-after': String(result.retryAfter) } : undefined), true;
      }
      const session = auth.createSession(result.user.id, false);
      return json(res, 201, { ok: true, redirect: '/dashboard' }, { 'set-cookie': sessionCookie(req, ctx, session.token, null) }), true;
    }

    if (method === 'POST' && route === '/login') {
      const result = await auth.login(await readBody(req), ip);
      if (!result.ok) {
        return json(res, result.status, { ok: false, error: result.error },
          result.retryAfter ? { 'retry-after': String(result.retryAfter) } : undefined), true;
      }
      return json(res, 200, { ok: true, redirect: result.user.role === 'admin' ? '/admin' : '/dashboard' },
        { 'set-cookie': sessionCookie(req, ctx, result.session.token, result.session.maxAgeSeconds) }), true;
    }

    if (method === 'POST' && route === '/logout') {
      auth.destroySession(auth.tokenFromRequest(req));
      return json(res, 200, { ok: true }, { 'set-cookie': clearCookie(req, ctx) }), true;
    }

    if (method === 'GET' && route === '/leaderboard') {
      const mode = query.get('mode') === 'fastest' ? 'fastest' : 'overall';
      return json(res, 200, scoring.leaderboard({
        mode, page: intParam(query.get('page'), 1), pageSize: intParam(query.get('pageSize'), 25),
        q: (query.get('q') || '').slice(0, 40), viewerId: user && user.role === 'user' ? user.id : null,
      })), true;
    }

    if (method === 'GET' && route === '/stream') return sse(req, res), true;

    // ----- everything below needs a session
    if (!user) return json(res, 401, { error: 'Sign in first.' }), true;

    if (method === 'POST' && route === '/profile/password') {
      const body = await readBody(req);
      const result = await auth.changePassword(user.id, body.currentPassword, body.newPassword, auth.tokenFromRequest(req));
      return json(res, result.ok ? 200 : result.status, result.ok ? { ok: true } : { ok: false, error: result.error, errors: result.errors || {} }), true;
    }

    // ----- player
    if (route === '/dashboard' || route === '/play') {
      if (user.role !== 'user') return json(res, 403, { error: 'Organiser accounts do not play.' }), true;
      if (method === 'GET' && route === '/dashboard') return json(res, 200, scoring.dashboard(user)), true;
      if (method === 'POST' && route === '/play') {
        if (user.status !== 'active') return json(res, 403, { error: 'This account is not allowed to play.' }), true;
        scoring.startCompetition(user.id);
        const play = ctx.ctf.play(req, user);
        return json(res, 200, { ok: true, redirect: play.redirect }, play.cookie ? { 'set-cookie': play.cookie } : undefined), true;
      }
    }

    // ----- organiser
    if (route.startsWith('/admin/')) {
      if (user.role !== 'admin') return json(res, 403, { error: 'Organisers only.' }), true;
      const a = route.slice('/admin'.length);
      const hooks = { dropCtfSessions: ctx.ctf.dropSessions };

      if (method === 'GET' && a === '/overview') return json(res, 200, admin.overview()), true;
      if (method === 'GET' && a === '/challenges') return json(res, 200, admin.challengeStats()), true;
      if (method === 'GET' && a === '/analytics') return json(res, 200, admin.analytics()), true;
      if (method === 'GET' && a === '/leaderboard') {
        return json(res, 200, admin.adminLeaderboard({
          mode: query.get('mode') === 'fastest' ? 'fastest' : 'overall', page: intParam(query.get('page'), 1),
          pageSize: intParam(query.get('pageSize'), 25), q: (query.get('q') || '').slice(0, 40),
        })), true;
      }
      if (method === 'GET' && a === '/users') {
        return json(res, 200, admin.listUsers({
          q: (query.get('q') || '').slice(0, 60), status: query.get('status') || '', progress: query.get('progress') || '',
          sort: query.get('sort') || 'newest', page: intParam(query.get('page'), 1), pageSize: intParam(query.get('pageSize'), 25),
        })), true;
      }
      let m = /^\/users\/(\d{1,9})$/.exec(a);
      if (method === 'GET' && m) {
        const found = admin.getUser(Number(m[1]));
        return json(res, found ? 200 : 404, found || { error: 'Player not found.' }), true;
      }
      m = /^\/users\/(\d{1,9})\/(status|reset)$/.exec(a);
      if (method === 'POST' && m) {
        const body = await readBody(req);
        const result = m[2] === 'status'
          ? admin.setStatus(user.id, Number(m[1]), body.status, body.reason, hooks)
          : admin.resetPlayer(user.id, Number(m[1]), body.reason, body.confirm, hooks);
        return json(res, result.ok ? 200 : result.status, result.ok ? { ok: true } : { ok: false, error: result.error }), true;
      }
      if (method === 'GET' && a === '/audit') {
        return json(res, 200, admin.auditLog({ page: intParam(query.get('page'), 1), pageSize: intParam(query.get('pageSize'), 30) })), true;
      }
      if (method === 'GET' && a === '/settings') return json(res, 200, admin.settings()), true;
      if (method === 'POST' && a === '/settings') return json(res, 200, admin.updateSettings(user.id, await readBody(req))), true;
      if (method === 'GET' && a === '/export.csv') {
        const csv = admin.exportCsv(user.id, query.get('mode') === 'fastest' ? 'fastest' : 'overall');
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'content-disposition': 'attachment; filename="solstice-leaderboard-' + new Date().toISOString().slice(0, 10) + '.csv"',
        });
        return res.end(csv), true;
      }
    }

    return json(res, 404, { error: 'Not found.' }), true;
  } catch (error) {
    if (error && error.status) return json(res, error.status, { error: error.status === 413 ? 'Request too large.' : 'Invalid request.' }), true;
    console.error('[platform]', error && error.stack ? error.stack : error);
    return json(res, 500, { error: 'Something went wrong.' }), true;
  }
}

// ---------------------------------------------------------------- pages
const ADMIN_VIEWS = new Set(['', 'players', 'challenges', 'leaderboard', 'analytics', 'audit', 'settings']);

function resolvePage(req, pathname) {
  const user = auth.userFromRequest(req);
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (/^\/platform\/[^/]+\.html$/i.test(clean)) return { notFound: true };
  if (clean === '/') return { file: 'auth.html' };
  if (clean === '/login') return { redirect: '/?form=login' };
  if (clean === '/register') return { redirect: '/?form=register' };
  if (clean === '/leaderboard') return { file: 'leaderboard.html' };
  if (clean === '/dashboard' || clean === '/challenges' || clean === '/profile') {
    if (!user) return { redirect: '/?form=login&next=' + encodeURIComponent(clean) };
    if (user.role === 'admin') return { redirect: '/admin' };
    return { file: clean.slice(1) + '.html' };
  }
  if (clean === '/admin' || clean.startsWith('/admin/')) {
    if (!user || user.role !== 'admin') return { redirect: user ? '/dashboard' : '/?form=login&next=/admin' };
    if (!ADMIN_VIEWS.has(clean.slice('/admin/'.length).replace(/^\/$/, ''))) return { notFound: true };
    return { file: 'admin.html' };
  }
  return null;
}

function sendPage(res, file, head) {
  let body;
  try { body = fs.readFileSync(path.join(PAGES_DIR, file)); } catch (e) { return false; }
  res.writeHead(200, { ...PAGE_HEADERS, 'content-length': body.length });
  res.end(head ? '' : body);
  return true;
}

// ---------------------------------------------------------------- lifecycle and hooks for server.js
async function init() {
  getDb();
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (username && email && password && !auth.adminExists()) {
    try {
      await auth.createAdmin({ username, email, password });
      console.log('[platform] Created the first organiser account "' + username + '".');
    } catch (error) {
      console.error('[platform] Could not create the organiser account:', error.message);
    }
  } else if (!auth.adminExists()) {
    console.log('[platform] No organiser account yet. Run "npm run admin:create" or set ADMIN_BOOTSTRAP_* once.');
  }
  janitor = setInterval(() => { try { auth.purgeExpiredSessions(); auth.sweepBuckets(); } catch (e) { /* retry next tick */ } }, 10 * 60 * 1000);
  if (janitor.unref) janitor.unref();
}

function shutdown() {
  if (janitor) clearInterval(janitor);
  closeDb();
}

module.exports = {
  init, shutdown, handleApi, resolvePage, sendPage, sameSiteAttr,
  playerFromRequest: auth.userFromRequest,
  recordSolve: scoring.recordSolve,
  progressLock: scoring.progressLock,
};
