'use strict';
const { DEPARTMENTS, JOB_TITLES, LOCATIONS } = require('../data/org');
const { FIRST_NAMES, LAST_NAMES } = require('../data/names');

const STAGES = ['Applied', 'Screening', 'Interviewing', 'Offer', 'Hired', 'Rejected', 'Withdrawn'];
const SOURCES = ['Careers Site', 'Referral', 'LinkedIn', 'Recruiting Agency', 'Job Board', 'University Program'];

function daysAgoIso(rng, min, max) { return new Date(Date.now() - rng.int(min, max) * 86400000).toISOString(); }

function run(db, rng, ctx, config) {
  const insJob = db.prepare('INSERT INTO job_openings (job_id, title, department_id, location, status, opened_at) VALUES (?,?,?,?,?,?)');
  const insCand = db.prepare('INSERT INTO candidates (candidate_id, full_name, email, source, created_at) VALUES (?,?,?,?,?)');
  const insApp = db.prepare('INSERT INTO applications (application_id, candidate_id, job_id, stage, applied_at) VALUES (?,?,?,?,?)');
  const insInt = db.prepare('INSERT INTO interviews (interview_id, application_id, interviewer_id, scheduled_at, outcome) VALUES (?,?,?,?,?)');

  db.exec('BEGIN');
  const jobIds = [];
  for (let i = 1; i <= config.JOB_OPENING_COUNT; i++) {
    const dept = rng.pick(DEPARTMENTS);
    insJob.run(i, rng.pick(JOB_TITLES[dept.code]), ctx.deptIdByCode[dept.code], rng.pick(LOCATIONS),
      rng.pickWeighted([['Open', 60], ['On Hold', 15], ['Closed', 25]]), daysAgoIso(rng, 5, 200));
    jobIds.push(i);
  }

  const candIds = [];
  for (let i = 1; i <= config.CANDIDATE_COUNT; i++) {
    const name = rng.pick(FIRST_NAMES) + ' ' + rng.pick(LAST_NAMES);
    insCand.run(i, name, name.toLowerCase().replace(' ', '.') + '@candidate.example', rng.pick(SOURCES), daysAgoIso(rng, 5, 250));
    candIds.push(i);
  }

  const appIds = [];
  for (let i = 1; i <= config.APPLICATION_COUNT; i++) {
    insApp.run(i, rng.pick(candIds), rng.pick(jobIds), rng.pick(STAGES), daysAgoIso(rng, 1, 200));
    appIds.push(i);
  }

  const interviewerPool = ctx.allEmployeeIds;
  for (let i = 1; i <= config.INTERVIEW_COUNT; i++) {
    insInt.run(i, rng.pick(appIds), rng.pick(interviewerPool), daysAgoIso(rng, 0, 150),
      rng.pickWeighted([['Pass', 45], ['Fail', 25], ['Pending', 30]]));
  }
  db.exec('COMMIT');
}

module.exports = { run };
