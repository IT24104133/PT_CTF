// Server-side-only progress tracking. Actual breadcrumb content, the vulnerable code paths, and
// the synthetic XXE filesystem get wired up in Phase 5 -- this just makes sure the table exists
// with a clean baseline row so Phase 2's auth layer has somewhere to record progress against.
'use strict';

function run(db) {
  db.exec(`DELETE FROM challenge_state`);
  db.prepare(`INSERT INTO challenge_state (session_key, updated_at) VALUES ('_template', ?)`).run(new Date().toISOString());
}

module.exports = { run };
