// One persistent, shared connection to db/peoplehub.sqlite, opened once at server startup and
// reused for every request. This is deliberately different from the old hr-portal lab pattern
// (lib/hrdb.js), which rebuilt an in-memory database from scratch on every single request --
// fine for a handful of rows, not for 1,000+ employees / 2,000+ audit rows at real scale.
'use strict';
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', '..', '..', 'data', 'db', 'peoplehub.sqlite');

let db = null;
function getDb() {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('PeopleHub database not found. Run: npm run seed:peoplehub');
  }
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

// Releases the file handle so something else (the seed script) can safely delete and rebuild
// db/peoplehub.sqlite on disk -- SQLite's own file locking means that can't happen while this
// process still has it open. The next getDb() call after this reopens it fresh.
function closeDb() {
  if (db) { try { db.close(); } catch (e) { /* already closed */ } db = null; }
}

module.exports = { getDb, closeDb, DB_PATH };
