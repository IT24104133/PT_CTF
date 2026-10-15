'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const data = path.join(root, 'data');

function seed(script) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root, stdio: 'inherit', env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(script + ' failed; server was not started.');
}

function prepare() {
  // These source assets must stay in Git; a disk mounted over data/ would hide them.
  for (const relative of [
    'db/schema.sql', 'evidence/X45ghLL.jpg', 'evidence/street.jpg', 'evidence/cafe.png',
    'challenge-data/hr/migration-notes.txt', 'challenge-data/hr/directory-sync.txt',
    'challenge-data/config/import-settings.txt', 'challenge-data/reports/legacy-report.txt',
    'challenge-data/archive/migration-history.txt',
  ]) {
    if (!fs.existsSync(path.join(data, relative))) {
      throw new Error('Required source asset missing: data/' + relative);
    }
  }

  const outerFiles = [
    path.join(data, 'users.json'), path.join(data, 'challenges.json'),
    ...['recovered.jpg', 'access.log', 'error.log', 'thumbcache.txt', 'prefetch.txt']
      .map(name => path.join(data, 'evidence', name)),
  ];
  if (outerFiles.some(file => !fs.existsSync(file))) {
    console.log('Preparing missing outer CTF data.');
    seed('src/seed/outer-seed.js');
  }

  const dbPath = path.join(data, 'db', 'peoplehub.sqlite');
  if (!fs.existsSync(dbPath)) {
    console.log('Preparing missing PeopleHub database.');
    try {
      seed('src/seed/seed.js');
    } catch (error) {
      // Only a database created by this failed first-boot attempt is removed.
      fs.rmSync(dbPath, { force: true });
      throw error;
    }
  }

  const { getDb, closeDb } = require('../src/lib/peoplehub/db');
  try {
    for (const file of outerFiles) {
      if (!fs.existsSync(file)) throw new Error('Generated data missing: ' + path.basename(file));
    }
    JSON.parse(fs.readFileSync(outerFiles[0], 'utf8'));
    JSON.parse(fs.readFileSync(outerFiles[1], 'utf8'));
    getDb().prepare('SELECT employee_id FROM employees LIMIT 1').get();
    getDb().prepare('SELECT user_id FROM users LIMIT 1').get();
    console.log('CTF data ready. Existing data preserved.');
  } finally {
    closeDb();
  }
}

prepare();
if (!process.argv.includes('--prepare-only')) require('../src/server');
