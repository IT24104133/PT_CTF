// Server-side-only progress tracking, keyed by the *outer* CTF session token so it survives a
// PeopleHub logout/login within the same run. Never returned by any normal API response -- only
// read by /api/ctf-admin (dev-only) and by the final Exhibit C completion check.
'use strict';

const FLAGS = ['stage3_login', 'stage3_directory', 'stage3_employee', 'stage3_report',
  'stage3_request', 'stage3_document', 'stage3_xxe', 'stage3_xss', 'stage3_emergency'];

function ensureRow(db, sessionKey) {
  const existing = db.prepare('SELECT * FROM challenge_state WHERE session_key = ?').get(sessionKey);
  if (existing) return existing;
  db.prepare('INSERT INTO challenge_state (session_key, updated_at) VALUES (?, ?)').run(sessionKey, new Date().toISOString());
  return db.prepare('SELECT * FROM challenge_state WHERE session_key = ?').get(sessionKey);
}

function get(db, sessionKey) {
  return ensureRow(db, sessionKey);
}

function setFlag(db, sessionKey, flag) {
  if (!FLAGS.includes(flag)) throw new Error('unknown challenge flag: ' + flag);
  ensureRow(db, sessionKey);
  const row = db.prepare('SELECT * FROM challenge_state WHERE session_key = ?').get(sessionKey);
  const allDone = FLAGS.every((f) => (f === flag ? 1 : row[f]));
  db.prepare(`UPDATE challenge_state SET ${flag} = 1, stage3_complete = ?, updated_at = ? WHERE session_key = ?`)
    .run(allDone ? 1 : row.stage3_complete, new Date().toISOString(), sessionKey);
  return get(db, sessionKey);
}

module.exports = { get, setFlag, FLAGS };
