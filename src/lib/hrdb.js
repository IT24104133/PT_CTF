// A small, genuinely vulnerable HR database for the SQL-injection lab. This is real SQLite
// (Node's built-in node:sqlite), running real queries built by naive string concatenation --
// the exact bug this lab teaches. Only the *data* is fake and only-ever in-memory: nothing
// here ever touches a real file, a real user's password, or the CTF's own users.json/session
// store, so the technique is genuine while the process behind it stays safe to expose.
'use strict';
const { DatabaseSync } = require('node:sqlite');

function buildHrDb(seed) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE hr_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE hr_employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, department TEXT NOT NULL);
    CREATE TABLE admin_notes (id INTEGER PRIMARY KEY, note TEXT NOT NULL);
  `);
  const insUser = db.prepare('INSERT INTO hr_users (username, password, role) VALUES (?, ?, ?)');
  for (const u of seed.users) insUser.run(u.username, u.password, u.role);
  const insEmp = db.prepare('INSERT INTO hr_employees (name, role, department) VALUES (?, ?, ?)');
  for (const e of seed.employees) insEmp.run(e.name, e.role, e.department || 'General');
  db.prepare('INSERT INTO admin_notes (note) VALUES (?)').run(seed.noteText);
  return db;
}

// Runs a single statement and reports success/failure the way a real driver would: rows on
// success, the engine's own error text on failure. `sql.prepare` only ever compiles the first
// statement in the string (same as sqlite3_prepare_v2), so stacked "; DROP TABLE ..." queries
// don't do anything here either -- that mirrors how most real single-statement query APIs behave.
function runOne(db, sql) {
  try {
    const rows = db.prepare(sql).all();
    return { ok: true, sql, rows };
  } catch (e) {
    return { ok: false, sql, error: e.message };
  }
}

// A "staging WAF" sits in front of the login form only. It's a naive blocklist -- exactly the
// kind a junior dev bolts on after getting popped once -- checking for the obvious stuff
// (comment markers, statement terminators, and the OR/AND/UNION/SELECT keywords) but only when
// they show up padded with literal space characters, the way a copy-pasted textbook payload
// looks. It has no idea that SQL doesn't need whitespace next to a quote or an operator, so a
// keyword sitting flush against a quote (e.g. '1'='1 with no spaces at all) sails straight
// through untouched.
const LOGIN_WAF_PATTERNS = ['--', '/*', ';', '#', ' or ', ' and ', ' union ', ' select ', 'sleep(', 'benchmark('];

function loginWafBlocks(s) {
  const v = String(s).toLowerCase();
  return LOGIN_WAF_PATTERNS.some((p) => v.indexOf(p) !== -1);
}

// The login form: built by concatenating the two fields straight into the WHERE clause.
// A row coming back at all -- for any reason -- is a successful bypass, exactly like a real
// broken login query. The WAF check runs first and short-circuits before any SQL is built, so a
// blocked attempt never even reaches the database (and never gets the debug SQL echoed back).
function rawLogin(db, username, password) {
  if (loginWafBlocks(username) || loginWafBlocks(password)) {
    return { ok: false, blocked: true, sql: null, error: 'Blocked by staging WAF (pattern match).' };
  }
  const sql = `SELECT id, username, role FROM hr_users WHERE username = '${username}' AND password = '${password}' LIMIT 1`;
  return runOne(db, sql);
}

// The search box's WAF is a different -- and worse -- kind than login's. Instead of rejecting a
// request outright, it strips blocked words out of the input and just runs whatever's left,
// exactly once, with no re-check of its own output. That kills a pasted-in classic payload, but
// it opens the oldest trick in the book: wrap the blocked word around a split copy of itself
// (e.g. 'uni' + 'union' + 'on' = 'uniunionon') and the filter removes the one clean match it can
// see in the middle, welding the leftover prefix and suffix back into the very word it was
// trying to block ('uni' + 'on' = 'union'). It runs on both `q` and `dept`, so both injection
// points now need it. It also means an entirely innocent search for something like "Coordinator"
// gets its "or" quietly eaten too -- a real side effect of a real class of lazy filter, not a bug
// in this lab.
const SEARCH_WAF_WORDS = ['union', 'select', 'or', '--', ';', '/*'];

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function sanitizeSearchInput(s) {
  let v = String(s);
  for (const word of SEARCH_WAF_WORDS) v = v.replace(new RegExp(escapeRegExp(word), 'gi'), '');
  return v;
}

// The employee search box: same underlying bug, and it returns three columns
// (name, role, department), so a UNION injection has to match that shape before it will run at
// all -- plus, now, survive the strip filter above. The department dropdown in the UI only ever
// sends a handful of fixed values -- but that's enforced by nothing except the <select> element,
// so a request built by hand can put anything there and it lands in the query exactly like `q`
// does, giving a second, independent injection point in the same endpoint.
function rawSearch(db, q, dept) {
  const cleanQ = sanitizeSearchInput(q);
  const cleanDept = dept ? sanitizeSearchInput(dept) : dept;
  let sql = `SELECT name, role, department FROM hr_employees WHERE (name LIKE '%${cleanQ}%' OR role LIKE '%${cleanQ}%')`;
  if (cleanDept) sql += ` AND department = '${cleanDept}'`;
  sql += ' LIMIT 50';
  return runOne(db, sql);
}

module.exports = { buildHrDb, rawLogin, rawSearch };
