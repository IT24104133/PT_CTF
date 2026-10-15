// Solstice CTF backend. No dependencies, Node 22.13+ (node:sqlite).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isIP } = require('node:net');
const N = require('./lib/normalize');
const F = require('./lib/forensics');
const HR = require('./lib/hrdb');
const XXE = require('./lib/xxe');
const PeopleHub = require('./lib/peoplehub/router');
const PeopleHubDb = require('./lib/peoplehub/db');
const PeopleHubChallenge = require('./lib/peoplehub/challengeState');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
// The three data locations can be overridden so tests run on a throwaway copy.
const EVIDENCE_DIR = path.resolve(process.env.EVIDENCE_DIR || path.join(ROOT_DIR, 'data', 'evidence'));
const USERS_FILE = process.env.USERS_FILE || path.join(ROOT_DIR, 'data', 'users.json');
const CHALLENGES_FILE = process.env.CHALLENGES_FILE || path.join(ROOT_DIR, 'data', 'challenges.json');

const MAX_ATTEMPTS = 5; // failed logins allowed per window, per IP
const WINDOW_MS = 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_ANSWER_TRIES = 10; // final-answer submissions allowed per window, per session
const MAX_LAB_TRIES = 30; // exploratory lab requests (typing payloads) allowed per window, per session

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.log': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

// Evidence files, grouped by which stage has to be unlocked before they can be downloaded.
const EVIDENCE_A = new Set(['street.jpg', 'cafe.png']);
const EVIDENCE_E = new Set(['access.log', 'error.log']);
const EVIDENCE_F = new Set(['thumbcache.txt', 'prefetch.txt']);

// sessions: token -> { username, expires, accepted, solved, stage2, solved2, stage3, solved3,
//   stage4, solved4, dhalf, stage5, solved5, stage6, solved6, lab3, lab4, payslipId, ...tries }
const sessions = new Map();
const attempts = new Map(); // ip -> { count, resetAt }

// ---------------------------------------------------------------- data
function loadUsers() {
  // Re-read on each login so edits to users.json apply without a restart.
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')).users || [];
}

function loadChallenges() {
  return JSON.parse(fs.readFileSync(CHALLENGES_FILE, 'utf8'));
}

function checkCredentials(username, password) {
  const user = loadUsers().find((u) => {
    const a = Buffer.from(u.username);
    const b = Buffer.from(username);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  // Hash even when the user is unknown so timing does not reveal valid usernames.
  const salt = user ? user.salt : '0'.repeat(32);
  const candidate = crypto.scryptSync(password, salt, 64);
  if (!user) return { ok: false, userKnown: false };
  const expected = Buffer.from(user.hash, 'hex');
  const ok = expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
  return { ok, userKnown: true };
}

// Describes what is odd about a login field without ever revealing its content.
function describeInput(raw) {
  const s = String(raw);
  return {
    len: s.length,
    edgeSpace: s !== s.trim(),
    hidden: /[\u200B-\u200D\u2060\uFEFF\u00AD\p{Cc}]/u.test(s),
    nonAscii: /[^\x00-\x7F]/.test(s),
  };
}

// Checks one answer field against its stored hashes.
function checkField(def, input) {
  if (!def || typeof input !== 'string' || input.length > 300) return false;

  if (def.type === 'video') {
    const id = N.videoId(input);
    if (id && def.idHash && N.safeEqualHex(N.hmac(def.salt, id), def.idHash)) return true;
  }

  const clean = def.type === 'phone' ? N.phone : N.text;
  const c = clean(input);
  if (!c) return false;
  const h = N.hmac(def.salt, c);
  return def.hashes.some((stored) => N.safeEqualHex(h, stored));
}

// Pulls the flag out of whatever was pasted, so extra words or line breaks around it are fine.
function pickFlag(text) {
  const t = String(text).slice(0, 2000);
  const m = /RP\{[^}\s]*\}/.exec(t);
  return m ? m[0] : t.trim();
}

function sameSecret(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// Checks the three Exhibit B answers. Returns { location, modified, model } as booleans.
function checkExhibitB(ch, body) {
  const get = (key) => (body && typeof body[key] === 'string' && body[key].length <= 300 ? body[key] : '');
  return {
    location: checkField(ch.fields.location, get('location')),
    modified: F.sameDate(get('modified'), ch.modified),
    model: checkField(ch.fields.model, get('model')),
  };
}

// ---------------------------------------------------------------- lab: HR portal (real engines)
// The SQL-injection and XXE labs run against real engines (lib/hrdb.js, lib/xxe.js): a genuine
// in-memory SQLite database and a genuine entity resolver. Nothing here touches a real database,
// a real file system or a real browser session — the data is fake and rebuilt fresh every call —
// but the vulnerability itself is not simulated: a payload has to actually be correct SQL or XML.

function buildHrDbFromChallenges(ch) {
  return HR.buildHrDb({ users: ch.hrUsers || [], employees: ch.employees || [], noteText: ch.noteText || '' });
}

function xxeSandboxFiles(ch) {
  return {
    'file:///etc/passwd': ch.decoyPasswd || '',
    'file:///etc/solstice/app.conf': ch.leakedConfig || '',
  };
}

// ---------------------------------------------------------------- helpers
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object';
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function redirect(res, to) {
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' });
  res.end();
}

function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

// A Cloudflare tunnel connects from this machine, so every visitor would look like
// 127.0.0.1. Trust the forwarding headers only when the connection is from loopback,
// which nobody on the internet or the local network can fake.
function fromLoopback(req) {
  const a = req.socket.remoteAddress;
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function clientIp(req) {
  // Render's managed ingress supplies the original client in X-Forwarded-For.
  // Enable this only inside Render, not for arbitrary direct connections.
  if (process.env.RENDER === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    const address = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
    if (isIP(address)) return address;
  }
  if (fromLoopback(req)) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();
  }
  return req.socket.remoteAddress;
}

// Adds the Secure cookie flag when the visitor reached us over HTTPS through the tunnel.
function secureFlag(req) {
  if (process.env.COOKIE_SECURE === '1') return '; Secure';
  return fromLoopback(req) && req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
}

function adminAllowed(req) {
  return process.env.DISABLE_CTF_ADMIN !== '1' && fromLoopback(req);
}

// Returns the live session object (mutable) with its token attached, or null.
function getSession(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(m[1]);
    return null;
  }
  s.token = m[1];
  return s;
}

// A limit of `max` tries per minute for each kind of submission. Returns the seconds to wait
// when the player is over the limit, or 0 after recording this try.
function throttle(s, key, max) {
  max = max || MAX_ANSWER_TRIES;
  const now = Date.now();
  s[key] = (s[key] || []).filter((t) => now - t < WINDOW_MS);
  if (s[key].length >= max) return Math.max(1, Math.ceil((s[key][0] + WINDOW_MS - now) / 1000));
  s[key].push(now);
  return 0;
}

function serveFile(req, res, dir, rel, cache, extraHeaders) {
  let name;
  try {
    name = decodeURIComponent(rel);
  } catch (e) {
    return send(res, 400, 'Bad request');
  }
  const file = path.normalize(path.join(dir, name));
  if (!file.startsWith(dir + path.sep)) return send(res, 403, 'Forbidden');
  // Check the resolved filename too, so URL-encoded spellings cannot bypass the route guard.
  if (file.toLowerCase() === path.join(PUBLIC_DIR, 'ctf-admin.html').toLowerCase() && !adminAllowed(req)) {
    return send(res, 404, 'Not found');
  }
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cache,
      ...(extraHeaders || {}),
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  const ip = clientIp(req);
  const isRead = req.method === 'GET' || req.method === 'HEAD';

  if (isRead && pathname === '/healthz') {
    try {
      loadUsers();
      loadChallenges();
      PeopleHubDb.getDb().prepare('SELECT employee_id FROM employees LIMIT 1').get();
      return send(res, 200, { ok: true });
    } catch (error) {
      return send(res, 503, { ok: false });
    }
  }

  // ----- login / logout / progress -----
  if (req.method === 'POST' && pathname === '/api/login') {
    const now = Date.now();
    let a = attempts.get(ip);
    if (!a || a.resetAt < now) a = { count: 0, resetAt: now + WINDOW_MS };
    if (a.count >= MAX_ATTEMPTS) {
      const wait = Math.ceil((a.resetAt - now) / 1000);
      return send(res, 429, { ok: false, error: 'Too many attempts. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });
    }

    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }

    const rawUser = body && body.username;
    const rawPass = body && body.password;
    if (typeof rawUser !== 'string' || typeof rawPass !== 'string' || rawUser.length > 200 || rawPass.length > 200) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const username = N.credential(rawUser);
    const password = N.credential(rawPass);

    const check = checkCredentials(username, password);
    if (check.ok) {
      attempts.delete(ip);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, {
        username,
        expires: Date.now() + SESSION_TTL_MS,
        accepted: false,
        solved: false,    // Exhibit A answered
        stage2: false,    // Stage 2 unlocked with the Exhibit A flag
        solved2: false,   // Exhibit B answered
        stage3: false,
        solved3: false,
        stage4: false,
        solved4: false,
        dhalf: false,     // acknowledged Exhibit D½
        stage5: false,
        solved5: false,
        stage6: false,
        solved6: false,
        lab3: { hrEntered: false, loginBypassed: false, noteLeaked: false, xssCaptured: false, token: null },
        lab4: { leaked: false },
        payslipId: 4413 + (crypto.randomInt ? crypto.randomInt(0, 50) : 0),
        tries: [], flagTries: [], bTries: [],
        lab3Tries: [], cTries: [], flagTries3: [],
        lab4Tries: [], dTries: [], flagTries4: [],
        flagTries5: [], eTries: [],
        flagTries6: [], fTries: [],
      });
      return send(res, 200, { ok: true, redirect: '/stage2.html' }, {
        'Set-Cookie': 'sid=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + SESSION_TTL_MS / 1000 + secureFlag(req),
      });
    }

    a.count += 1;
    attempts.set(ip, a);
    // Safe to log: lengths and flags only, never the text that was typed.
    console.log(
      new Date().toISOString(), 'login failed', 'ip=' + ip, 'userKnown=' + check.userKnown,
      'user=' + JSON.stringify(describeInput(rawUser)), 'pass=' + JSON.stringify(describeInput(rawPass))
    );
    return send(res, 401, { ok: false, error: 'Invalid username or password.', remaining: MAX_ATTEMPTS - a.count });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    const s = getSession(req);
    if (s) sessions.delete(s.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secureFlag(req) });
  }

  if (req.method === 'GET' && pathname === '/api/session') {
    return send(res, 200, { authenticated: !!getSession(req) });
  }

  if (req.method === 'GET' && pathname === '/api/progress') {
    const s = getSession(req);
    if (!s) return send(res, 401, { authenticated: false });
    const ch = loadChallenges();
    const out = {
      authenticated: true,
      accepted: s.accepted, solved: s.solved,
      stage2: s.stage2, solved2: s.solved2,
      stage3: s.stage3, solved3: s.solved3,
      stage4: s.stage4, solved4: s.solved4,
      dhalf: s.dhalf,
      stage5: s.stage5, solved5: s.solved5,
      stage6: s.stage6, solved6: s.solved6,
    };
    if (s.solved) out.flag = ch.exhibitA.flag;
    if (s.stage2) out.exhibitBReady = !!(ch.exhibitB && ch.exhibitB.ready);
    if (s.solved2 && ch.exhibitB && ch.exhibitB.flag) out.flag2 = ch.exhibitB.flag;
    if (s.stage3 && ch.exhibitC) out.hrAccessCode = ch.exhibitC.portalAccessCode;
    if (s.solved3 && ch.exhibitC && ch.exhibitC.flag) out.flag3 = ch.exhibitC.flag;
    if (s.solved4 && ch.exhibitD && ch.exhibitD.flag) out.flag4 = ch.exhibitD.flag;
    if (s.stage5) out.exhibitEReady = !!(ch.exhibitE && ch.exhibitE.ready);
    if (s.solved5 && ch.exhibitE && ch.exhibitE.flag) out.flag5 = ch.exhibitE.flag;
    if (s.stage6) out.exhibitFReady = !!(ch.exhibitF && ch.exhibitF.ready);
    if (s.solved6 && ch.exhibitF && ch.exhibitF.flag) out.flag6 = ch.exhibitF.flag;
    return send(res, 200, out);
  }

  // ----- resume: a returning player pastes a flag they already earned -----
  // Sessions live in memory for an hour, so someone who logs back in later starts fresh. A flag
  // is proof that its stage was solved, so it restores everything up to and including that
  // stage. Progress is only ever switched on here, never off, so an older flag can't set a
  // player back.
  if (req.method === 'POST' && pathname === '/api/resume') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });

    const wait = throttle(s, 'resumeTries');
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 8192);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const given = pickFlag(body && typeof body.flag === 'string' ? body.flag : '');
    const ch = loadChallenges();
    const flags = [ch.exhibitA, ch.exhibitB, ch.exhibitC, ch.exhibitD, ch.exhibitE, ch.exhibitF].map((e) => e && e.flag);
    let lock = 0;
    for (let i = 0; i < flags.length; i++) {
      if (given && flags[i] && sameSecret(given, flags[i])) { lock = i + 1; break; }
    }
    if (!lock) return send(res, 200, { ok: false, error: 'That flag was not recognised. Check it and try again.' });

    s.accepted = true;
    if (lock >= 1) { s.solved = true; s.stage2 = true; }
    if (lock >= 2) { s.solved2 = true; s.stage3 = true; }
    if (lock >= 3) { s.solved3 = true; s.stage4 = true; }
    if (lock >= 4) { s.solved4 = true; s.stage5 = true; }   // Exhibit D½ still plays once, then Stage 5 is already open
    if (lock >= 5) { s.solved5 = true; s.stage6 = true; }
    if (lock >= 6) { s.solved6 = true; }
    const next = ['/exhibit-b.html', '/exhibit-c.html', '/exhibit-d.html', '/exhibit-dhalf.html', '/exhibit-f.html', '/epilogue.html'][lock - 1];
    return send(res, 200, { ok: true, lock, redirect: next + '?intro=1' });
  }

  // ----- case flow: Stage 1 -----
  if (req.method === 'POST' && pathname === '/api/accept') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    s.accepted = true;
    return send(res, 200, { ok: true, redirect: '/exhibit-a.html' });
  }

  if (req.method === 'POST' && pathname === '/api/exhibit-a') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.accepted) return send(res, 403, { ok: false, error: 'Accept the case first.' });

    const wait = throttle(s, 'tries');
    if (wait) return send(res, 429, { ok: false, error: 'Too many submissions. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 8192);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }

    const ch = loadChallenges().exhibitA;
    const results = {};
    for (const key of Object.keys(ch.fields)) results[key] = checkField(ch.fields[key], body && body[key]);
    const allCorrect = Object.values(results).every(Boolean);
    if (allCorrect) s.solved = true;

    const out = { ok: true, results, solved: allCorrect };
    if (allCorrect) out.flag = ch.flag;
    return send(res, 200, out);
  }

  // ----- Stage 2: unlock with the Stage 1 flag, then answer Exhibit B -----
  if (req.method === 'POST' && pathname === '/api/unlock-stage2') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.accepted) return send(res, 403, { ok: false, error: 'Accept the case first.' });

    const wait = throttle(s, 'flagTries');
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 8192);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const given = pickFlag(body && typeof body.flag === 'string' ? body.flag : '');
    if (given && sameSecret(given, loadChallenges().exhibitA.flag)) {
      s.stage2 = true;
      return send(res, 200, { ok: true, redirect: '/exhibit-b.html?intro=1' });
    }
    return send(res, 200, { ok: false, error: 'That flag is not correct. Check it and try again.' });
  }

  if (req.method === 'POST' && pathname === '/api/exhibit-b') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage2) return send(res, 403, { ok: false, error: 'Stage 2 is locked.' });

    const ch = loadChallenges().exhibitB;
    if (!ch || !ch.ready) return send(res, 503, { ok: false, error: 'This stage is not ready yet. Check back soon.' });

    const wait = throttle(s, 'bTries');
    if (wait) return send(res, 429, { ok: false, error: 'Too many submissions. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 8192);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const results = checkExhibitB(ch, body);
    const solved = Object.values(results).every(Boolean);
    if (solved) s.solved2 = true;

    const out = { ok: true, results, solved };
    if (solved && ch.flag) out.flag = ch.flag;
    return send(res, 200, out);
  }

  // ----- Stage 3: unlock with the Stage 2 flag, then the HR portal lab -----
  if (req.method === 'POST' && pathname === '/api/unlock-stage3') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.solved2) return send(res, 403, { ok: false, error: 'Finish Exhibit B first.' });

    const wait = throttle(s, 'flagTries3');
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 8192);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const given = pickFlag(body && typeof body.flag === 'string' ? body.flag : '');
    const ch = loadChallenges();
    if (given && ch.exhibitB && ch.exhibitB.flag && sameSecret(given, ch.exhibitB.flag)) {
      s.stage3 = true;
      return send(res, 200, { ok: true, redirect: '/exhibit-c.html?intro=1' });
    }
    return send(res, 200, { ok: false, error: 'That flag is not correct. Check it and try again.' });
  }


  // The staging-portal front door. Low-stakes on its own — Stage 3 still has to be unlocked
  // server-side before login or search will do anything real.
  if (req.method === 'POST' && pathname === '/api/hrportal/enter') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage3) return send(res, 403, { ok: false, error: 'Stage 3 is locked.' });
    const wait = throttle(s, 'lab3Tries', MAX_LAB_TRIES);
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Wait ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 1024);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const given = String((body && body.code) || '').trim();
    const ch = loadChallenges().exhibitC;
    if (given && ch.portalAccessCode && sameSecret(given.toUpperCase(), String(ch.portalAccessCode).toUpperCase())) {
      s.lab3.hrEntered = true;
      return send(res, 200, { ok: true });
    }
    return send(res, 200, { ok: false, error: 'That code was not recognised.' });
  }

  if (req.method === 'GET' && pathname === '/api/hrportal/state') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    const ch = loadChallenges().exhibitC || {};
    const employees = ch.employees || [];
    const deptCount = new Set(employees.map((e) => e.department).filter(Boolean)).size;
    return send(res, 200, {
      ok: true, stage3: s.stage3, stage4: s.stage4,
      entered: !!s.lab3.hrEntered, loggedIn: !!s.lab3.loginBypassed, noteLeaked: !!s.lab3.noteLeaked,
      xxeLeaked: !!s.lab4.leaked,
      employeeCount: employees.length, departmentCount: deptCount,
    });
  }

  // Real SQLite behind this one (lib/hrdb.js): the query is built by string concatenation, so
  // any syntactically valid injection works on its own merits, not because it matches a pattern.
  if (req.method === 'POST' && pathname === '/api/hrportal/login') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage3) return send(res, 403, { ok: false, error: 'Stage 3 is locked.' });
    if (!s.lab3.hrEntered) return send(res, 403, { ok: false, error: 'Enter the portal access code first.' });
    const wait = throttle(s, 'lab3Tries', MAX_LAB_TRIES);
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Wait ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 2048);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const username = body && typeof body.username === 'string' ? body.username.slice(0, 300) : '';
    const password = body && typeof body.password === 'string' ? body.password.slice(0, 300) : '';
    const ch = loadChallenges().exhibitC;
    const db = buildHrDbFromChallenges(ch);
    const result = HR.rawLogin(db, username, password);
    if (result.blocked) {
      return send(res, 200, { ok: true, bypass: false, message: 'Request blocked: input matched a known attack pattern.', sql: null });
    }
    if (!result.ok) {
      return send(res, 200, { ok: true, bypass: false, message: 'Query failed: ' + result.error, sql: result.sql });
    }
    const bypass = result.rows.length > 0;
    if (bypass) s.lab3.loginBypassed = true;
    const row = bypass ? result.rows[0] : null;
    return send(res, 200, {
      ok: true,
      bypass,
      message: bypass
        ? 'Welcome, ' + row.username + '. Role: ' + row.role + '. (The query matched a row without a real password.)'
        : 'Invalid username or password.',
      sql: result.sql,
    });
  }

  // Real UNION-based leak: the search query returns two columns, so the injected SELECT has to
  // match that shape before SQLite will even run it.
  if (req.method === 'POST' && pathname === '/api/hrportal/search') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage3) return send(res, 403, { ok: false, error: 'Stage 3 is locked.' });
    if (!s.lab3.loginBypassed) return send(res, 403, { ok: false, error: 'This tool is only reachable once you are logged in.' });
    const wait = throttle(s, 'lab3Tries', MAX_LAB_TRIES);
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Wait ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 2048);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const q = body && typeof body.q === 'string' ? body.q.slice(0, 300) : '';
    const dept = body && typeof body.dept === 'string' ? body.dept.slice(0, 300) : '';
    const ch = loadChallenges().exhibitC;
    const db = buildHrDbFromChallenges(ch);
    const result = HR.rawSearch(db, q, dept);
    if (!result.ok) {
      return send(res, 200, { ok: true, success: false, error: result.error, results: [], sql: result.sql });
    }
    const noteLeaked = result.rows.some((r) => Object.values(r).some((v) => typeof v === 'string' && v.includes(ch.noteText)));
    if (noteLeaked) s.lab3.noteLeaked = true;
    return send(res, 200, { ok: true, success: true, results: result.rows, noteLeaked, sql: result.sql });
  }

  // Real DOCTYPE/ENTITY resolution (lib/xxe.js): only a correctly formed external-entity
  // declaration, actually referenced in the body, will pull sandboxed file content into the
  // parsed record. SYSTEM identifiers never touch the real filesystem.
  if (req.method === 'POST' && pathname === '/api/hrportal/import') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage4) return send(res, 403, { ok: false, error: 'Stage 4 is locked.' });
    const wait = throttle(s, 'lab4Tries', MAX_LAB_TRIES);
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Wait ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 20000);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const xml = body && typeof body.xml === 'string' ? body.xml.slice(0, 20000) : '';
    if (!xml.trim()) return send(res, 200, { ok: true, leaked: false, message: 'Nothing to import.' });

    const ch = loadChallenges().exhibitD;
    const result = XXE.importEmployeeXml(xml, xxeSandboxFiles(ch));
    if (!result.ok) {
      return send(res, 200, { ok: true, leaked: false, message: 'Import failed: ' + result.error });
    }
    if (result.leaked) s.lab4.leaked = true;
    return send(res, 200, {
      ok: true,
      leaked: result.leaked,
      message: result.leaked
        ? 'Import complete. One field pulled in more than expected:'
        : 'Import complete. 1 employee record parsed. No unusual content.',
      leakedText: result.leaked ? result.leakedText : null,
    });
  }

  // Polled by exhibit-c.html when the player returns to this tab after working in PeopleHub.
  // Reports only the combined completion state, never the individual sub-flags -- this page's
  // "what's left" feedback shouldn't hand out the investigation chain.
  if (req.method === 'GET' && pathname === '/api/lab/c-status') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage3) return send(res, 403, { ok: false, error: 'Stage 3 is locked.' });
    let investigation = false;
    try { investigation = !!PeopleHubChallenge.get(PeopleHubDb.getDb(), s.token).stage3_complete; } catch (e) { /* not seeded yet */ }
    return send(res, 200, { ok: true, investigation });
  }

  if (req.method === 'POST' && pathname === '/api/exhibit-c') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage3) return send(res, 403, { ok: false, error: 'Stage 3 is locked.' });

    const wait = throttle(s, 'cTries');
    if (wait) return send(res, 429, { ok: false, error: 'Too many submissions. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 4096);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const ch = loadChallenges().exhibitC;
    // The nine individual PeopleHub investigation flags (login/directory/employee/report/
    // request/document/xxe/xss/emergency) are never exposed here, on purpose -- only their
    // combined completion state -- so this page's "what's left" feedback doesn't hand out the
    // solve chain itself.
    let investigation = false;
    try {
      const phState = PeopleHubChallenge.get(PeopleHubDb.getDb(), s.token);
      investigation = !!phState.stage3_complete;
    } catch (e) { /* PeopleHub database not seeded yet -- investigation stays false */ }
    const results = {
      investigation,
      code: checkField(ch.fields.code, body && body.code),
    };
    const solved = Object.values(results).every(Boolean);
    if (solved) s.solved3 = true;
    const out = { ok: true, results, solved };
    if (solved) out.flag = ch.flag;
    return send(res, 200, out);
  }

  // ----- Stage 4: unlock with the Stage 3 flag, then the XXE / IDOR lab -----
  if (req.method === 'POST' && pathname === '/api/unlock-stage4') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.solved3) return send(res, 403, { ok: false, error: 'Finish Exhibit C first.' });

    const wait = throttle(s, 'flagTries4');
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 8192);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const given = pickFlag(body && typeof body.flag === 'string' ? body.flag : '');
    const ch = loadChallenges();
    if (given && ch.exhibitC && ch.exhibitC.flag && sameSecret(given, ch.exhibitC.flag)) {
      s.stage4 = true;
      return send(res, 200, { ok: true, redirect: '/exhibit-d.html?intro=1' });
    }
    return send(res, 200, { ok: false, error: 'That flag is not correct. Check it and try again.' });
  }

  if (req.method === 'GET' && pathname === '/api/lab/d-status') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage4) return send(res, 403, { ok: false, error: 'Stage 4 is locked.' });
    return send(res, 200, { ok: true, leaked: !!s.lab4.leaked });
  }

  if (req.method === 'GET' && pathname === '/api/lab/my-payslip-id') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage4) return send(res, 403, { ok: false, error: 'Stage 4 is locked.' });
    return send(res, 200, { ok: true, id: s.payslipId });
  }

  if (req.method === 'GET' && pathname === '/api/lab/payslip') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage4) return send(res, 403, { ok: false, error: 'Stage 4 is locked.' });
    const wait = throttle(s, 'lab4Tries', MAX_LAB_TRIES);
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Wait ' + wait + 's.' }, { 'Retry-After': String(wait) });

    const idRaw = searchParams.get('id') || '';
    const id = parseInt(idRaw, 10);
    if (!Number.isInteger(id) || id < 0 || idRaw.length > 10) return send(res, 200, { ok: false, error: 'Invalid payslip id.' });

    if (id === s.payslipId) {
      return send(res, 200, { ok: true, record: { id, name: 'You', role: 'Incident Response (trainee)', years: 0, debt: 'No outstanding balance' } });
    }
    const ch = loadChallenges().exhibitD;
    const record = ch.payslips[String(id)];
    if (!record) return send(res, 200, { ok: false, error: 'No payslip found for id ' + id + '.' });
    return send(res, 200, { ok: true, record });
  }

  if (req.method === 'POST' && pathname === '/api/exhibit-d') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage4) return send(res, 403, { ok: false, error: 'Stage 4 is locked.' });

    const wait = throttle(s, 'dTries');
    if (wait) return send(res, 429, { ok: false, error: 'Too many submissions. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 4096);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const ch = loadChallenges().exhibitD;
    const results = {
      passphrase: !!s.lab4.leaked && checkField(ch.fields.passphrase, body && body.passphrase),
      debt: checkField(ch.fields.debt, body && body.debt),
    };
    const solved = Object.values(results).every(Boolean);
    if (solved) s.solved4 = true;
    const out = { ok: true, results, solved };
    if (solved) out.flag = ch.flag;
    return send(res, 200, out);
  }

  // ----- Exhibit D½: a narrative beat, no puzzle -----
  if (req.method === 'POST' && pathname === '/api/ack-dhalf') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.solved4) return send(res, 403, { ok: false, error: 'Finish Exhibit D first.' });
    s.dhalf = true;
    return send(res, 200, { ok: true, redirect: '/gate-5.html' });
  }

  // ----- Stage 5: unlock with the Stage 4 flag, then the log analysis -----
  if (req.method === 'POST' && pathname === '/api/unlock-stage5') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.solved4 || !s.dhalf) return send(res, 403, { ok: false, error: 'Finish Exhibit D first.' });

    const wait = throttle(s, 'flagTries5');
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 8192);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const given = pickFlag(body && typeof body.flag === 'string' ? body.flag : '');
    const ch = loadChallenges();
    if (given && ch.exhibitD && ch.exhibitD.flag && sameSecret(given, ch.exhibitD.flag)) {
      s.stage5 = true;
      return send(res, 200, { ok: true, redirect: '/exhibit-e.html?intro=1' });
    }
    return send(res, 200, { ok: false, error: 'That flag is not correct. Check it and try again.' });
  }

  if (req.method === 'POST' && pathname === '/api/exhibit-e') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage5) return send(res, 403, { ok: false, error: 'Stage 5 is locked.' });

    const ch = loadChallenges().exhibitE;
    if (!ch || !ch.ready) return send(res, 503, { ok: false, error: 'This stage is not ready yet. Check back soon.' });

    const wait = throttle(s, 'eTries');
    if (wait) return send(res, 429, { ok: false, error: 'Too many submissions. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 4096);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const results = {
      attackerIp: checkField(ch.fields.attackerIp, body && body.attackerIp),
      uaFlag: !!(body && typeof body.uaFlag === 'string' && ch.uaFlag && sameSecret(pickFlag(body.uaFlag), ch.uaFlag)),
    };
    const solved = Object.values(results).every(Boolean);
    if (solved) s.solved5 = true;
    const out = { ok: true, results, solved };
    if (solved) out.flag = ch.flag;
    return send(res, 200, out);
  }

  // ----- Stage 6: unlock with the Stage 5 flag, then the disk-forensics lab -----
  if (req.method === 'POST' && pathname === '/api/unlock-stage6') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.solved5) return send(res, 403, { ok: false, error: 'Finish Exhibit E first.' });

    const wait = throttle(s, 'flagTries6');
    if (wait) return send(res, 429, { ok: false, error: 'Too many tries. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 8192);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const given = pickFlag(body && typeof body.flag === 'string' ? body.flag : '');
    const ch = loadChallenges();
    if (given && ch.exhibitE && ch.exhibitE.flag && sameSecret(given, ch.exhibitE.flag)) {
      s.stage6 = true;
      return send(res, 200, { ok: true, redirect: '/exhibit-f.html?intro=1' });
    }
    return send(res, 200, { ok: false, error: 'That flag is not correct. Check it and try again.' });
  }

  if (req.method === 'POST' && pathname === '/api/exhibit-f') {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage6) return send(res, 403, { ok: false, error: 'Stage 6 is locked.' });

    const ch = loadChallenges().exhibitF;
    if (!ch || !ch.ready) return send(res, 503, { ok: false, error: 'This stage is not ready yet. Check back soon.' });

    const wait = throttle(s, 'fTries');
    if (wait) return send(res, 429, { ok: false, error: 'Too many submissions. Try again in ' + wait + 's.' }, { 'Retry-After': String(wait) });

    let body;
    try {
      body = await readJson(req, 4096);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid request.' });
    }
    const results = {
      thumbFlag: !!(body && typeof body.thumbFlag === 'string' && ch.thumbFlag && sameSecret(pickFlag(body.thumbFlag), ch.thumbFlag)),
      program: checkField(ch.fields.program, body && body.program),
      lastRun: F.sameTimestamp(body && typeof body.lastRun === 'string' ? body.lastRun : '', ch.lastRun),
    };
    const solved = Object.values(results).every(Boolean);
    if (solved) s.solved6 = true;
    const out = { ok: true, results, solved };
    if (solved) out.flag = ch.flag;
    return send(res, 200, out);
  }

  // ----- protected pages -----
  if (isRead && pathname === '/map.html') {
    if (!getSession(req)) return redirect(res, '/');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/stage2.html') {
    if (!getSession(req)) return redirect(res, '/');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/exhibit-a.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.accepted) return redirect(res, '/stage2.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/gate-2.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.accepted) return redirect(res, '/stage2.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/exhibit-b.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.accepted) return redirect(res, '/stage2.html');
    if (!s.stage2) return redirect(res, '/gate-2.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/gate-3.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved2) return redirect(res, '/exhibit-b.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/exhibit-c.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved2) return redirect(res, '/exhibit-b.html');
    if (!s.stage3) return redirect(res, '/gate-3.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/gate-4.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved3) return redirect(res, '/exhibit-c.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/exhibit-d.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved3) return redirect(res, '/exhibit-c.html');
    if (!s.stage4) return redirect(res, '/gate-4.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/exhibit-dhalf.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved4) return redirect(res, '/exhibit-d.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/gate-5.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved4) return redirect(res, '/exhibit-d.html');
    if (!s.dhalf) return redirect(res, '/exhibit-dhalf.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/exhibit-e.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved4) return redirect(res, '/exhibit-d.html');
    if (!s.dhalf) return redirect(res, '/exhibit-dhalf.html');
    if (!s.stage5) return redirect(res, '/gate-5.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/gate-6.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved5) return redirect(res, '/exhibit-e.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/exhibit-f.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved5) return redirect(res, '/exhibit-e.html');
    if (!s.stage6) return redirect(res, '/gate-6.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  if (isRead && pathname === '/epilogue.html') {
    const s = getSession(req);
    if (!s) return redirect(res, '/');
    if (!s.solved6) return redirect(res, '/exhibit-f.html');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
  }

  // ----- PeopleHub (Exhibit C's real target) -----
  // Reachable only once the outer case has unlocked Stage 3, exactly like the old hr-portal.html
  // was. Everything past that gate is PeopleHub's own concern: its own login, its own sessions,
  // its own roles -- server.js just hands off to it.
  if (pathname.startsWith('/api/peoplehub/')) {
    const s = getSession(req);
    if (!s) return send(res, 401, { ok: false, error: 'Not signed in.' });
    if (!s.stage3) return send(res, 403, { ok: false, error: 'Stage 3 is locked.' });
    return PeopleHub.handle(req, res, pathname, searchParams, { send, readJson }, s);
  }

  // Developer-only reset/inspection panel. Never linked from the app; gated on the connection
  // itself (loopback only) rather than on any player's game progress, since a developer needs it
  // reachable before a player has even started.
  if (pathname.startsWith('/api/ctf-admin/')) {
    if (!adminAllowed(req)) return send(res, 404, 'Not found');
    return PeopleHub.handleAdmin(req, res, pathname, searchParams, { send, readJson });
  }
  if (isRead && pathname === '/ctf-admin.html') {
    if (!adminAllowed(req)) return send(res, 404, 'Not found');
    return serveFile(req, res, PUBLIC_DIR, pathname, 'no-store');
  }

  if (isRead && pathname.startsWith('/evidence/')) {
    const s = getSession(req);
    const name = pathname.slice('/evidence/'.length);
    let allowed = false;
    let extra = {};
    if (s && s.accepted && EVIDENCE_A.has(name)) allowed = true;
    if (s && s.stage2) {
      const b = loadChallenges().exhibitB;
      if (b && b.ready && b.photo && name === b.photo) {
        allowed = true;
        // Browsers that keep the server's date give the downloaded file this modified time.
        if (b.lastModified) extra['Last-Modified'] = new Date(b.lastModified).toUTCString();
      }
    }
    if (s && s.stage5 && EVIDENCE_E.has(name)) allowed = true;
    if (s && s.stage6 && EVIDENCE_F.has(name)) allowed = true;
    if (!allowed) return send(res, 404, 'Not found');
    // The photo is sent byte for byte, so its metadata reaches the player untouched.
    // ?download=1 makes the browser save the original file instead of showing it.
    if (searchParams.get('download') === '1') extra['Content-Disposition'] = 'attachment; filename="' + name + '"';
    return serveFile(req, res, EVIDENCE_DIR, name, 'private, no-store', extra);
  }

  if (isRead) return serveFile(req, res, PUBLIC_DIR, pathname === '/' ? '/index.html' : pathname, 'no-cache');
  send(res, 405, 'Method not allowed');
});

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k);
  for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
}, 60 * 1000).unref();

for (const f of [USERS_FILE, CHALLENGES_FILE]) {
  if (!fs.existsSync(f)) {
    console.error(path.basename(f) + ' not found. Run "npm run seed" first.');
    process.exit(1);
  }
}

server.listen(PORT, () => console.log('Solstice CTF running at http://localhost:' + server.address().port));

function shutdown() {
  server.close(() => {
    PeopleHubDb.closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
