#!/usr/bin/env node
// Solstice PeopleHub -- deterministic seed orchestrator.
//
//   node seed/seed.js
//   SEED_EMPLOYEE_COUNT=2000 node seed/seed.js
//
// Clears and rebuilds db/peoplehub.sqlite from scratch, in the fixed order below (each step
// depends on tables the previous ones created). Same RNG seed in, same database out, every time.
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { child } = require('./lib/rng');

function main() {
  const t0 = Date.now();
  console.log('Solstice PeopleHub -- seeding database (seed=%d)', config.RNG_SEED);

  // Step 1: clear. A fresh file, not a wipe-in-place, so a half-written previous run can never
  // leave stale tables behind.
  fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });
  if (fs.existsSync(config.DB_PATH)) fs.unlinkSync(config.DB_PATH);

  const db = new DatabaseSync(config.DB_PATH);
  db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'db', 'schema.sql'), 'utf8'));

  // Step 2: roles + employees (+ profiles + payroll) -- everything else depends on this.
  const employeesGen = require('./generators/employees');
  const ctx = employeesGen.run(db, child(config.RNG_SEED, 'employees'), config);
  console.log('  employees: %d rows', ctx.allEmployeeIds.length);

  // Step 3: roles + login accounts.
  const accountsGen = require('./generators/accounts');
  accountsGen.run(db, child(config.RNG_SEED, 'accounts'), ctx);
  const userRows = db.prepare('SELECT user_id FROM users').all();
  console.log('  users: %d rows', userRows.length);

  require('./generators/leave').run(db, child(config.RNG_SEED, 'leave'), ctx, config);
  console.log('  leave records: %d rows', config.LEAVE_COUNT);

  require('./generators/performance').run(db, child(config.RNG_SEED, 'performance'), ctx, config);
  console.log('  performance reviews: %d rows', config.PERFORMANCE_REVIEW_COUNT);

  require('./generators/documents').run(db, child(config.RNG_SEED, 'documents'), ctx, config);
  console.log('  documents: %d rows', config.DOCUMENT_COUNT);

  require('./generators/requests').run(db, child(config.RNG_SEED, 'requests'), ctx, config);
  console.log('  hr requests: %d rows, it tickets: %d rows', config.HR_REQUEST_COUNT, config.IT_TICKET_COUNT);

  require('./generators/audit').run(db, child(config.RNG_SEED, 'audit'), ctx, config, userRows);
  console.log('  audit logs: %d rows, security events: %d rows', config.AUDIT_COUNT, config.SECURITY_EVENT_COUNT);

  require('./generators/comms').run(db, child(config.RNG_SEED, 'comms'), ctx, config);
  console.log('  notifications: %d rows, announcements: %d rows', config.NOTIFICATION_COUNT, config.ANNOUNCEMENT_COUNT);

  require('./generators/reports').run(db, child(config.RNG_SEED, 'reports'), ctx, config);
  console.log('  reports: %d', config.REPORT_COUNT);

  require('./generators/recruitment').run(db, child(config.RNG_SEED, 'recruitment'), ctx, config);
  console.log('  job openings: %d, candidates: %d, applications: %d, interviews: %d',
    config.JOB_OPENING_COUNT, config.CANDIDATE_COUNT, config.APPLICATION_COUNT, config.INTERVIEW_COUNT);

  require('./generators/training').run(db, child(config.RNG_SEED, 'training'), ctx, config);
  console.log('  training courses: %d, enrollments: %d', config.TRAINING_COURSE_COUNT, config.TRAINING_ENROLLMENT_COUNT);

  require('./generators/imports').run(db, child(config.RNG_SEED, 'imports'), ctx, config);
  console.log('  import history + emergency access requests seeded');

  require('./generators/challenge').run(db);
  console.log('  challenge_state initialized');

  db.close();
  console.log('Done in %dms -> %s', Date.now() - t0, config.DB_PATH);
}

main();
