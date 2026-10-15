'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');

test('free Render deployment', { timeout: 180000 }, async (t) => {
  const fixture = fs.mkdtempSync(path.join(root, '.deploy-test-'));
  let server;
  t.after(async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    // fixture is a newly created directory strictly below this project root.
    assert.equal(path.dirname(fixture), root);
    assert.ok(path.basename(fixture).startsWith('.deploy-test-'));
    fs.rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  for (const directory of ['src', 'public', 'deploy']) {
    fs.cpSync(path.join(root, directory), path.join(fixture, directory), { recursive: true });
  }
  for (const relative of ['data/db/schema.sql', 'data/evidence/X45ghLL.jpg', 'data/evidence/street.jpg', 'data/evidence/cafe.png']) {
    const target = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  }
  fs.cpSync(path.join(root, 'data/challenge-data'), path.join(fixture, 'data/challenge-data'), { recursive: true });
  const env = { ...process.env, NODE_ENV: 'production', DISABLE_CTF_ADMIN: '1', COOKIE_SECURE: '1', RENDER: 'true', PORT: '0' };
  for (const key of ['SEED_OUT', 'USERS_FILE', 'CHALLENGES_FILE', 'EVIDENCE_DIR']) delete env[key];
  function prepare() {
    const result = spawnSync(process.execPath, ['deploy/render-start.cjs', '--prepare-only'], {
      cwd: fixture, env, encoding: 'utf8', timeout: 120000, windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout;
  }
  const dbPath = path.join(fixture, 'data/db/peoplehub.sqlite');

  await t.test('clean checkout seeds the complete CTF without existing runtime data', () => {
    prepare();
    const db = new DatabaseSync(dbPath);
    try {
      assert.ok(db.prepare('SELECT COUNT(*) AS n FROM employees').get().n >= 1000);
      assert.ok(db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0);
    } finally { db.close(); }
    const challenges = JSON.parse(fs.readFileSync(path.join(fixture, 'data/challenges.json')));
    assert.equal(challenges.exhibitB.ready, true);
    assert.equal(challenges.exhibitE.ready, true);
    assert.equal(challenges.exhibitF.ready, true);
    assert.ok(fs.existsSync(path.join(fixture, 'data/evidence/recovered.jpg')));
  });

  await t.test('repeated preparation preserves existing database changes and login data', () => {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec("UPDATE employees SET preferred_name = 'Deployment persistence check' WHERE employee_id = (SELECT MIN(employee_id) FROM employees)");
    } finally { db.close(); }
    const usersPath = path.join(fixture, 'data/users.json');
    const usersBefore = fs.readFileSync(usersPath, 'utf8');
    prepare();
    assert.equal(fs.readFileSync(usersPath, 'utf8'), usersBefore);
    const reopened = new DatabaseSync(dbPath);
    try {
      assert.equal(reopened.prepare('SELECT preferred_name FROM employees ORDER BY employee_id LIMIT 1').get().preferred_name, 'Deployment persistence check');
    } finally { reopened.close(); }
  });

  await t.test('missing outer data is recreated even when the PeopleHub database exists', () => {
    fs.unlinkSync(path.join(fixture, 'data/users.json'));
    fs.unlinkSync(path.join(fixture, 'data/challenges.json'));
    prepare();
    assert.ok(fs.existsSync(path.join(fixture, 'data/users.json')));
    const db = new DatabaseSync(dbPath);
    try {
      assert.equal(db.prepare('SELECT preferred_name FROM employees ORDER BY employee_id LIMIT 1').get().preferred_name, 'Deployment persistence check');
    } finally { db.close(); }
  });

  // A test-only credential avoids depending on or printing the CTF's actual credentials.
  const username = 'deployment-test';
  const password = crypto.randomBytes(24).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(fixture, 'data/users.json'), JSON.stringify({ users: [{
    username, salt, hash: crypto.scryptSync(password, salt, 64).toString('hex'),
  }] }));
  server = spawn(process.execPath, ['deploy/render-start.cjs'], { cwd: fixture, env, windowsHide: true });
  let output = '';
  let stderr = '';
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { stderr += chunk; });
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Startup timed out: ' + stderr)), 15000);
    server.on('error', error => { clearTimeout(timeout); reject(error); });
    server.on('exit', code => { clearTimeout(timeout); reject(new Error('Startup exited ' + code + ': ' + stderr)); });
    server.stdout.on('data', () => {
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timeout); resolve('http://127.0.0.1:' + match[1]); }
    });
  });
  function post(url, body, ip = '198.51.100.10') {
    return fetch(address + url, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-forwarded-for': ip,
    }, body: JSON.stringify(body) });
  }

  await t.test('health, homepage, login, HTTPS cookie, and progress endpoints work', async () => {
    const health = await fetch(address + '/healthz');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal((await fetch(address + '/')).status, 200);
    const login = await post('/api/login', { username, password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /; Secure/);
    assert.equal((await fetch(address + '/api/progress', { headers: { cookie: cookie.split(';')[0] } })).status, 200);
    const phCookie = spawnSync(process.execPath, ['-e', "const s=require('./src/lib/peoplehub/session'); if(!s.cookieHeader('test').includes('; Secure') || !s.clearCookieHeader().includes('; Secure')) process.exit(1)"], { cwd: fixture, env, windowsHide: true });
    assert.equal(phCookie.status, 0);
  });

  await t.test('hosted reset panel stays blocked including encoded URLs', async () => {
    for (const url of ['/ctf-admin.html', '/%63tf-admin.html', '/CTF-ADMIN.HTML', '/api/ctf-admin/state', '/%2e/ctf-admin.html']) {
      assert.equal((await fetch(address + url)).status, 404, url);
    }
    assert.equal((await post('/api/ctf-admin/reset-db', {})).status, 404);
  });

  await t.test('Render visitors do not share one login rate limit', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await post('/api/login', { username: 'missing', password: 'wrong' })).status, 401);
    assert.equal((await post('/api/login', { username: 'missing', password: 'wrong' })).status, 429);
    assert.equal((await post('/api/login', { username: 'missing', password: 'wrong' }, '198.51.100.11')).status, 401);
  });
});
