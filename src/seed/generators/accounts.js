// The 9 roles and PeopleHub login accounts (distinct from the outer CTF's own login). Each role
// gets a handful of named accounts, linked to real employee records so "who is this user" always
// resolves to a real person in the directory -- exactly like a real HR system's account list would.
'use strict';

const ROLES = [
  ['Employee', 'Standard employee access: own profile, own leave, own documents, own requests.'],
  ['Manager', 'Everything an Employee has, plus visibility into their direct team.'],
  ['HR Helpdesk', 'Front-line HR support: directory, HR requests, general documents.'],
  ['HR Manager', 'HR administration, reporting, and employee management.'],
  ['Recruiter', 'Recruitment: job openings, candidates, applications, interviews.'],
  ['Payroll', 'Payroll and compensation records.'],
  ['IT Support', 'IT tickets and account/device support tooling.'],
  ['Security', 'Security events, audit logs, and access review tooling.'],
  ['Administrator', 'Full administrative access to the PeopleHub system.'],
];

function run(db, rng, ctx) {
  const insRole = db.prepare('INSERT INTO roles (role_id, name, description) VALUES (?, ?, ?)');
  const roleIdByName = {};
  ROLES.forEach(([name, desc], i) => { insRole.run(i + 1, name, desc); roleIdByName[name] = i + 1; });

  const insUser = db.prepare(`INSERT INTO users
    (user_id, username, password_hash, role_id, employee_id, is_active, last_login_at, created_at) VALUES (?,?,?,?,?,?,?,?)`);

  // A password_hash column exists for shape/realism, but nothing in the app ever compares
  // against it directly by design (see the challenge developer notes) -- these are opaque
  // placeholder strings, not real hashes of anything.
  function fakeHash(rng) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 24; i++) s += chars[rng.int(0, chars.length - 1)];
    return s;
  }

  let userId = 1;
  const now = new Date().toISOString();

  function addUser(employeeId, roleName) {
    insUser.run(userId, employeeId.toLowerCase(), fakeHash(rng), roleIdByName[roleName], employeeId, 1, now, now);
    userId++;
  }

  // Insertion order matters here in a way it doesn't for any other table: the login lookup
  // (router.js) uses `LIMIT 1` with no `ORDER BY`, so a blind, untargeted injection
  // (' OR '1'='1' -- ) returns SQLite's natural row order -- i.e. whichever account was INSERTed
  // first. Low-privilege accounts go first on purpose, so a blind bypass only ever lands on an
  // ordinary Employee account. Reaching anything higher-privilege requires a *targeted* payload
  // (a specific username, or a role/employee_id learned by investigating elsewhere in the app) --
  // that escalation path is the actual puzzle, not the injection itself.
  const leadershipIds = new Set([ctx.ceo, ctx.cpo, ctx.cto, ...Object.values(ctx.deptHeadOf)]);
  const pool = rng.shuffle(ctx.allEmployeeIds.filter((id) => !leadershipIds.has(id)));
  let p = 0;
  const seats = { 'Employee': 30, 'Manager': 20, 'HR Helpdesk': 4, 'IT Support': 5, 'Recruiter': 3, 'Payroll': 3 };
  for (const [role, count] of Object.entries(seats)) {
    for (let i = 0; i < count && p < pool.length; i++, p++) addUser(pool[p], role);
  }

  // Higher-privilege seats, added last: Security, then HR Manager, then Administrator --
  // deliberately in ascending order of how much damage the account can do.
  const securitySeats = 4, hrManagerSeats = 2;
  for (let i = 0; i < securitySeats && p < pool.length; i++, p++) addUser(pool[p], 'Security');
  for (let i = 0; i < hrManagerSeats && p < pool.length; i++, p++) addUser(pool[p], 'HR Manager');
  addUser(ctx.cpo, 'HR Manager');
  for (const [code, id] of Object.entries(ctx.deptHeadOf)) {
    addUser(id, code === 'HR' ? 'HR Manager' : code === 'SEC' ? 'Security' : 'Manager');
  }
  // Administrator accounts are inserted dead last -- the two hardest to reach blindly.
  addUser(ctx.ceo, 'Administrator');
  addUser(ctx.cto, 'Administrator');

  return { roleIdByName };
}

module.exports = { run };
