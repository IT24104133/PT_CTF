// Administration -> Employee Data Import. A real (if naive) XML entity resolver -- lib/xxe.js,
// reused as-is from the original lab, since it already does exactly the right thing: a sandboxed
// "filesystem" that SYSTEM identifiers can resolve against, and nothing else. The classic first
// attempt (file:///etc/passwd) resolves to an obviously-fake decoy, confirming the technique
// works without ever touching anything real, and nudging toward the files that actually matter.
'use strict';
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { requirePhAuth, fail, pagination } = require('../helpers');
const { can } = require('../rbac');
const XXE = require('../../xxe');
const CS = require('../challengeState');

const CHALLENGE_DATA_DIR = path.join(__dirname, '..', '..', '..', '..', 'data', 'challenge-data');

let fileMapCache = null;
function sandboxFiles() {
  if (fileMapCache) return fileMapCache;
  function read(rel) {
    try { return fs.readFileSync(path.join(CHALLENGE_DATA_DIR, rel), 'utf8'); } catch (e) { return null; }
  }
  fileMapCache = {
    // A recognisable decoy -- fake usernames, fake shells, nothing that resembles this machine's
    // real /etc/passwd -- so a player's first instinct (try the classic path) still teaches them
    // the injection works, without this lab ever touching a real file.
    'file:///etc/passwd': 'root:x:0:0:root:/root:/bin/bash\nsvc-peoplehub:x:1001:1001::/home/svc-peoplehub:/usr/sbin/nologin\n(this is a synthetic file; PeopleHub never reads the real filesystem)\n',
    'file:///challenge-data/hr/migration-notes.txt': read('hr/migration-notes.txt'),
    'file:///challenge-data/hr/directory-sync.txt': read('hr/directory-sync.txt'),
    'file:///challenge-data/config/import-settings.txt': read('config/import-settings.txt'),
    'file:///challenge-data/reports/legacy-report.txt': read('reports/legacy-report.txt'),
    'file:///challenge-data/archive/migration-history.txt': read('archive/migration-history.txt'),
  };
  return fileMapCache;
}

function guardAdmin(req, send, res) {
  const s = requirePhAuth(req);
  if (!s) { fail(send, res, 401, 'Not signed in.'); return null; }
  if (!can(s.roleName, 'admin')) { fail(send, res, 403, 'You do not have access to Employee Data Import.'); return null; }
  return s;
}

async function handleValidate(req, res, { send, readJson }, outerSession) {
  const s = guardAdmin(req, send, res);
  if (!s) return;
  let body;
  try { body = await readJson(req, 20000); } catch (e) { return fail(send, res, 400, 'Invalid request.'); }
  const xml = body && typeof body.xml === 'string' ? body.xml.slice(0, 20000) : '';
  if (!xml.trim()) return send(res, 200, { ok: true, valid: false, message: 'Nothing to validate.' });

  const result = XXE.importEmployeeXml(xml, sandboxFiles());
  if (!result.ok) return send(res, 200, { ok: true, valid: false, message: 'Import validation failed: ' + result.error });

  if (result.leaked) {
    const db = getDb();
    CS.setFlag(db, outerSession.token, 'stage3_xxe');
  }

  return send(res, 200, {
    ok: true, valid: true,
    preview: { name: result.name, role: result.role, note: result.note },
    message: 'Validation complete. 1 employee record recognised.',
  });
}

async function handleProcess(req, res, { send, readJson }, outerSession) {
  const s = guardAdmin(req, send, res);
  if (!s) return;
  let body;
  try { body = await readJson(req, 20000); } catch (e) { return fail(send, res, 400, 'Invalid request.'); }
  const xml = body && typeof body.xml === 'string' ? body.xml.slice(0, 20000) : '';
  if (!xml.trim()) return send(res, 200, { ok: true, imported: false, message: 'Nothing to import.' });

  const db = getDb();
  const result = XXE.importEmployeeXml(xml, sandboxFiles());
  const now = new Date().toISOString();

  if (!result.ok) {
    db.prepare(`INSERT INTO import_jobs (import_id, filename, status, records_processed, records_success, records_rejected, warnings, created_at)
      VALUES ((SELECT COALESCE(MAX(import_id),0)+1 FROM import_jobs), ?, 'Failed', 1, 0, 1, ?, ?)`)
      .run('manual-upload.xml', result.error, now);
    return send(res, 200, { ok: true, imported: false, message: 'Import failed: ' + result.error });
  }

  if (result.leaked) CS.setFlag(db, outerSession.token, 'stage3_xxe');

  // A real insert, using whatever the parsed (and possibly entity-expanded) fields turned out to
  // be -- exactly like a real importer would, for better or worse.
  const nextId = 'SD-' + (20000 + Math.floor(Math.random() * 9999));
  const deptRow = db.prepare('SELECT department_id FROM departments WHERE code = ?').get('HR') || { department_id: 2 };
  try {
    db.prepare(`INSERT INTO employees
      (employee_id, first_name, last_name, preferred_name, email, phone_extension, job_title, department_id,
       manager_id, location, office, employment_type, employment_status, job_grade, join_date, date_of_birth,
       work_mode, profile_photo, is_leadership, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(nextId, String(result.name || 'Imported Employee').split(' ')[0] || 'Imported',
        String(result.name || 'Employee').split(' ').slice(1).join(' ') || 'Employee', null,
        nextId.toLowerCase() + '@solstice.example', String(1000 + Math.floor(Math.random() * 8999)),
        String(result.role || 'New Hire').slice(0, 100), deptRow.department_id, null, 'Riverton HQ', 'Building A',
        'Full Time', 'Active', 'G4', now.slice(0, 10), null, 'Hybrid', null, 0, now, now);
  } catch (e) { /* best-effort; validation already reported success */ }

  db.prepare(`INSERT INTO import_jobs (import_id, filename, status, records_processed, records_success, records_rejected, warnings, created_at)
    VALUES ((SELECT COALESCE(MAX(import_id),0)+1 FROM import_jobs), ?, 'Completed', 1, 1, 0, ?, ?)`)
    .run('manual-upload.xml', result.leaked ? 'One field contained more content than expected.' : null, now);

  return send(res, 200, {
    ok: true, imported: true,
    message: result.leaked ? 'Import complete. 1 employee record parsed. One field pulled in more than expected:' : 'Import complete. 1 employee record parsed. No unusual content.',
    leakedText: result.leaked ? result.leakedText : null,
  });
}

function handleHistory(req, res, { send }, searchParams) {
  const s = guardAdmin(req, send, res);
  if (!s) return;
  const db = getDb();
  const { page, pageSize, offset } = pagination(searchParams, [10, 25, 50]);
  const total = db.prepare('SELECT COUNT(*) n FROM import_jobs').get().n;
  const rows = db.prepare(`SELECT import_id, filename, status, records_processed, records_success, records_rejected, warnings, created_at
    FROM import_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(pageSize, offset);
  return send(res, 200, { ok: true, total, page, pageSize, results: rows });
}

module.exports = { handleValidate, handleProcess, handleHistory };
