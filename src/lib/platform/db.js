'use strict';
// The competition database. It is a separate SQLite file from the deliberately vulnerable
// PeopleHub database, and nothing inside the challenge code ever opens it, so an exploit
// against a challenge cannot reach accounts, scores or audit records.
//
// All timestamps are UTC epoch milliseconds (INTEGER).

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { CHALLENGES } = require('./catalog');

const DEFAULT_PATH = path.join(__dirname, '..', '..', '..', 'data', 'db', 'platform.sqlite');

let db = null;
const statements = new Map();

function dbPath() {
  return process.env.PLATFORM_DB_PATH ? path.resolve(process.env.PLATFORM_DB_PATH) : DEFAULT_PATH;
}

// Each entry runs once, in order. user_version records how many have been applied, so existing
// data is kept and new releases only add what is missing.
const MIGRATIONS = [
  (d) => {
    d.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        account_status TEXT NOT NULL DEFAULT 'active'
          CHECK (account_status IN ('active', 'suspended', 'disqualified')),
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE INDEX idx_users_role_status ON users (role, account_status);
      CREATE INDEX idx_users_created ON users (created_at);

      CREATE TABLE challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        stage INTEGER NOT NULL,
        points INTEGER NOT NULL CHECK (points >= 0),
        verification_reference TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL
      );

      CREATE TABLE challenge_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        challenge_id INTEGER NOT NULL REFERENCES challenges (id) ON DELETE RESTRICT,
        completed_at INTEGER NOT NULL,
        points_awarded INTEGER NOT NULL CHECK (points_awarded >= 0),
        UNIQUE (user_id, challenge_id)
      );
      CREATE INDEX idx_progress_challenge ON challenge_progress (challenge_id, completed_at);
      CREATE INDEX idx_progress_completed ON challenge_progress (completed_at);

      CREATE TABLE competition_progress (
        user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        started_at INTEGER,
        finished_at INTEGER,
        score INTEGER NOT NULL DEFAULT 0,
        solved_count INTEGER NOT NULL DEFAULT 0,
        last_solve_at INTEGER,
        completion_status TEXT NOT NULL DEFAULT 'not_started'
          CHECK (completion_status IN ('not_started', 'in_progress', 'completed'))
      );
      CREATE INDEX idx_comp_score ON competition_progress (score DESC, last_solve_at);
      CREATE INDEX idx_comp_status ON competition_progress (completion_status, finished_at);

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        remember INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_sessions_user ON sessions (user_id);
      CREATE INDEX idx_sessions_expires ON sessions (expires_at);

      CREATE TABLE admin_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
        reason TEXT,
        detail TEXT,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX idx_audit_time ON admin_audit_logs (timestamp DESC);
      CREATE INDEX idx_audit_target ON admin_audit_logs (target_user_id);

      CREATE TABLE player_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_events_user ON player_events (user_id, created_at DESC);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO settings (key, value) VALUES ('registration_open', '1');
    `);
  },
];

function syncCatalog(d) {
  const upsert = d.prepare(`
    INSERT INTO challenges (key, name, stage, points, verification_reference, summary, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET
      name = excluded.name, stage = excluded.stage, points = excluded.points,
      verification_reference = excluded.verification_reference,
      summary = excluded.summary, sort_order = excluded.sort_order
  `);
  CHALLENGES.forEach((c, i) => upsert.run(c.key, c.name, c.stage, c.points, c.ref, c.summary, i));
}

function open() {
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL');
  d.exec('PRAGMA foreign_keys = ON');
  d.exec('PRAGMA busy_timeout = 5000');
  d.exec('PRAGMA synchronous = NORMAL');

  let version = d.prepare('PRAGMA user_version').get().user_version;
  while (version < MIGRATIONS.length) {
    d.exec('BEGIN IMMEDIATE');
    try {
      MIGRATIONS[version](d);
      version += 1;
      d.exec('PRAGMA user_version = ' + version);
      d.exec('COMMIT');
    } catch (error) {
      d.exec('ROLLBACK');
      d.close();
      throw error;
    }
  }
  syncCatalog(d);
  return d;
}

function getDb() {
  if (!db) db = open();
  return db;
}

// Prepared statements are cached per connection because the same few queries run constantly.
function stmt(sql) {
  let s = statements.get(sql);
  if (!s) {
    s = getDb().prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

// Runs fn inside one atomic write transaction.
function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (error) {
    try { d.exec('ROLLBACK'); } catch (e) { /* already rolled back */ }
    throw error;
  }
}

function closeDb() {
  statements.clear();
  if (db) {
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) { /* best effort */ }
    db.close();
    db = null;
  }
}

function getSetting(key, fallback) {
  const row = stmt('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  stmt('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

module.exports = { getDb, stmt, transaction, closeDb, dbPath, getSetting, setSetting };
