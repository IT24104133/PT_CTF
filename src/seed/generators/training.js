'use strict';
const { TRAINING_COURSES, TRAINING_STATUSES_WEIGHTED } = require('../data/catalog');

const MANDATORY = new Set(['Security Awareness Fundamentals', 'Code of Conduct', 'Anti-Harassment Training', 'Data Protection Essentials']);

function daysAgoIso(rng, min, max) { return new Date(Date.now() - rng.int(min, max) * 86400000).toISOString(); }

function run(db, rng, ctx, config) {
  const insCourse = db.prepare('INSERT INTO training_courses (course_id, name, description, is_mandatory) VALUES (?,?,?,?)');
  const insEnroll = db.prepare(`INSERT INTO training_enrollments
    (enrollment_id, employee_id, course_id, status, enrolled_at, completed_at) VALUES (?,?,?,?,?,?)`);

  db.exec('BEGIN');
  const courseIds = [];
  TRAINING_COURSES.slice(0, config.TRAINING_COURSE_COUNT).forEach((name, idx) => {
    const id = idx + 1;
    insCourse.run(id, name, `Required professional development covering: ${name}.`, MANDATORY.has(name) ? 1 : 0);
    courseIds.push(id);
  });

  for (let i = 1; i <= config.TRAINING_ENROLLMENT_COUNT; i++) {
    const emp = rng.pick(ctx.empRows);
    const status = rng.pickWeighted(TRAINING_STATUSES_WEIGHTED);
    const enrolled = daysAgoIso(rng, 10, 300);
    insEnroll.run(i, emp.employee_id, rng.pick(courseIds), status, enrolled,
      status === 'Completed' ? daysAgoIso(rng, 0, 280) : null);
  }
  db.exec('COMMIT');
}

module.exports = { run };
