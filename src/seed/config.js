// Central knobs for the PeopleHub synthetic dataset. Every count here can be overridden with an
// env var of the same name (SEED_EMPLOYEE_COUNT=2000 node seed/seed.js) without touching code.
// Defaults match the minimums the challenge spec calls for.
'use strict';

function num(envName, fallback) {
  const v = process.env[envName];
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

module.exports = {
  // A fixed seed makes the whole dataset deterministic: same seed in, same database out, every
  // time, so "run the seed twice" produces identical base data (challenge answers included).
  RNG_SEED: num('SEED_RNG_SEED', 20260101),

  EMPLOYEE_COUNT: num('SEED_EMPLOYEE_COUNT', 1000),
  LEAVE_COUNT: num('SEED_LEAVE_COUNT', 520),
  DOCUMENT_COUNT: num('SEED_DOCUMENT_COUNT', 520),
  HR_REQUEST_COUNT: num('SEED_REQUEST_COUNT', 520),
  IT_TICKET_COUNT: num('SEED_IT_TICKET_COUNT', 320),
  AUDIT_COUNT: num('SEED_AUDIT_COUNT', 2100),
  NOTIFICATION_COUNT: num('SEED_NOTIFICATION_COUNT', 320),
  ANNOUNCEMENT_COUNT: num('SEED_ANNOUNCEMENT_COUNT', 52),
  REPORT_COUNT: num('SEED_REPORT_COUNT', 16),
  JOB_OPENING_COUNT: num('SEED_JOB_OPENING_COUNT', 100),
  CANDIDATE_COUNT: num('SEED_CANDIDATE_COUNT', 260),
  APPLICATION_COUNT: num('SEED_APPLICATION_COUNT', 520),
  INTERVIEW_COUNT: num('SEED_INTERVIEW_COUNT', 210),
  PERFORMANCE_REVIEW_COUNT: num('SEED_PERFORMANCE_REVIEW_COUNT', 320),
  TRAINING_COURSE_COUNT: num('SEED_TRAINING_COURSE_COUNT', 30),
  TRAINING_ENROLLMENT_COUNT: num('SEED_TRAINING_ENROLLMENT_COUNT', 1050),
  SECURITY_EVENT_COUNT: num('SEED_SECURITY_EVENT_COUNT', 520),

  EMAIL_DOMAIN: 'solstice.example',
  DB_PATH: require('path').join(__dirname, '..', '..', 'data', 'db', 'peoplehub.sqlite'),
};
