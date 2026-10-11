'use strict';
const { NOTIFICATION_TEMPLATES, ANNOUNCEMENT_TITLES } = require('../data/catalog');

const ANNOUNCEMENT_BODIES = {
  'Annual Benefits Enrollment': 'Open enrollment for health, dental, and vision plans runs through the end of the month. Review your options in the Benefits section.',
  'Security Awareness Week': 'This week features short training sessions on phishing, password hygiene, and reporting suspicious activity.',
  'Office Maintenance Notice': 'Scheduled maintenance will affect building access on the listed dates. Plan accordingly.',
  'New Remote Work Policy': 'An updated Remote Work Policy is now published. Please review the changes in the Company Policies section.',
  'Employee Town Hall': 'Join leadership for a company-wide update on strategy, results, and upcoming initiatives.',
};
function bodyFor(title) {
  return ANNOUNCEMENT_BODIES[title] || `See the Company Policies and HR Requests sections for details related to: ${title}.`;
}
function daysAgoIso(rng, min, max) { return new Date(Date.now() - rng.int(min, max) * 86400000).toISOString(); }

function run(db, rng, ctx, config) {
  const insNotif = db.prepare(`INSERT INTO notifications
    (notification_id, employee_id, message, type, is_read, created_at) VALUES (?,?,?,?,?,?)`);
  const insAnn = db.prepare(`INSERT INTO announcements
    (announcement_id, title, body, published_by, published_at, is_pinned) VALUES (?,?,?,?,?,?)`);

  db.exec('BEGIN');
  for (let i = 1; i <= config.NOTIFICATION_COUNT; i++) {
    const emp = rng.pick(ctx.empRows);
    insNotif.run(i, emp.employee_id, rng.pick(NOTIFICATION_TEMPLATES), 'system', rng.bool(0.55) ? 1 : 0, daysAgoIso(rng, 0, 120));
  }
  // ANNOUNCEMENT_TITLES only has ~15 entries -- nowhere near config.ANNOUNCEMENT_COUNT -- so
  // once the base list is exhausted (shuffled once per lap for variety), later laps get a
  // quarter/half-year tag appended, the way a real company reposts recurring announcements
  // ("Payroll Calendar Update — Q1", "...— Q2", etc.) rather than silently truncating the list.
  const PERIOD_TAGS = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2'];
  const titles = [];
  let lap = 0;
  while (titles.length < config.ANNOUNCEMENT_COUNT) {
    for (const base of rng.shuffle(ANNOUNCEMENT_TITLES)) {
      if (titles.length >= config.ANNOUNCEMENT_COUNT) break;
      titles.push(lap === 0 ? base : base + ' — ' + rng.pick(PERIOD_TAGS));
    }
    lap++;
  }
  titles.forEach((title, idx) => {
    insAnn.run(idx + 1, title, bodyFor(title.split(' — ')[0]), rng.pick(ctx.allEmployeeIds), daysAgoIso(rng, 0, 300), idx < 3 ? 1 : 0);
  });
  db.exec('COMMIT');
}

module.exports = { run };
