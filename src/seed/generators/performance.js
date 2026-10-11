'use strict';
const { PERFORMANCE_RATINGS_WEIGHTED, REVIEW_PERIODS } = require('../data/catalog');

const SUMMARY_BY_RATING = {
  'Needs Improvement': 'Did not consistently meet expectations for the role this period. A development plan has been discussed with the manager.',
  'Developing': 'Making progress toward role expectations. Continued growth expected with support from the team.',
  'Successful': 'Met expectations for the role, delivering consistent and reliable work throughout the period.',
  'Exceeds Expectations': 'Consistently exceeded expectations, taking on additional scope and delivering strong results.',
  'Outstanding': 'Exceptional performance across all areas, significantly exceeding expectations for the role.',
};
const GOAL_TEMPLATES = [
  'Complete certification relevant to current role.',
  'Improve cross-team collaboration on shared projects.',
  'Take ownership of a key initiative next period.',
  'Mentor a newer team member.',
  'Improve documentation practices for handoffs.',
  'Deepen expertise in a core tool used by the team.',
];

function run(db, rng, ctx, config) {
  const ins = db.prepare(`INSERT INTO performance_reviews
    (review_id, employee_id, reviewer_id, review_period, rating, summary, goals, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const byManager = new Map(ctx.empRows.map((e) => [e.employee_id, e]));
  const withManagers = db.prepare('SELECT employee_id, manager_id FROM employees WHERE manager_id IS NOT NULL').all();
  db.exec('BEGIN');
  for (let i = 1; i <= config.PERFORMANCE_REVIEW_COUNT; i++) {
    const row = rng.pick(withManagers);
    const rating = rng.pickWeighted(PERFORMANCE_RATINGS_WEIGHTED);
    ins.run(i, row.employee_id, row.manager_id, rng.pick(REVIEW_PERIODS), rating,
      SUMMARY_BY_RATING[rating], rng.shuffle(GOAL_TEMPLATES).slice(0, rng.int(1, 3)).join(' | '),
      'Finalized', new Date(2025, rng.int(0, 8), rng.int(1, 28)).toISOString());
  }
  db.exec('COMMIT');
}

module.exports = { run };
