'use strict';
// Scores, progress and leaderboards. Points are only ever written by recordSolve(), which the
// server calls after its own answer check has passed; no client request can award points.

const { EventEmitter } = require('node:events');
const { stmt, transaction } = require('./db');
const { CHALLENGES, KEYS, EXHIBIT_KEYS, TOTAL_POINTS } = require('./catalog');
const { logEvent } = require('./auth');

const bus = new EventEmitter();
bus.setMaxListeners(0);
let pending = null;

// Several solves landing together produce one push to the open leaderboards.
function announceChange(kind) {
  if (pending) return;
  pending = setTimeout(() => { pending = null; bus.emit('change', { kind, at: Date.now() }); }, 200);
  if (pending.unref) pending.unref();
}

function ensureCompetitionRow(userId) {
  stmt('INSERT OR IGNORE INTO competition_progress (user_id) VALUES (?)').run(userId);
}

function completedRows(userId) {
  return stmt(`SELECT c.key, c.name, c.stage, cp.completed_at, cp.points_awarded
    FROM challenge_progress cp JOIN challenges c ON c.id = cp.challenge_id
    WHERE cp.user_id = ? ORDER BY c.sort_order`).all(userId);
}

// Number of consecutive exhibits complete from Exhibit A, and whether the entry gate is done.
function progressLock(userId) {
  const done = new Set(completedRows(userId).map((r) => r.key));
  let lock = 0;
  while (lock < EXHIBIT_KEYS.length && done.has(EXHIBIT_KEYS[lock])) lock += 1;
  return { entryDone: done.has('entry'), lock, done };
}

// Marks the official start of the run (idempotent) and returns it.
function startCompetition(userId, now = Date.now()) {
  return transaction(() => {
    ensureCompetitionRow(userId);
    const row = stmt('SELECT started_at FROM competition_progress WHERE user_id = ?').get(userId);
    if (row.started_at) return row.started_at;
    stmt(`UPDATE competition_progress SET started_at = ?, completion_status = 'in_progress' WHERE user_id = ?`).run(now, userId);
    logEvent(userId, 'started', null, now);
    return now;
  });
}

// Awards a challenge once. Safe to call on every successful verification: repeats are no-ops.
function recordSolve(userId, key, now = Date.now()) {
  const challenge = CHALLENGES.find((c) => c.key === key);
  if (!challenge) return { awarded: false, reason: 'unknown-challenge' };

  const result = transaction(() => {
    const user = stmt('SELECT id, role, account_status FROM users WHERE id = ?').get(userId);
    if (!user || user.role !== 'user') return { awarded: false, reason: 'not-a-player' };
    if (user.account_status !== 'active') return { awarded: false, reason: 'account-' + user.account_status };

    ensureCompetitionRow(userId);
    const index = KEYS.indexOf(key);
    const have = new Set(stmt(`SELECT c.key FROM challenge_progress cp JOIN challenges c ON c.id = cp.challenge_id
      WHERE cp.user_id = ?`).all(userId).map((r) => r.key));
    if (have.has(key)) return { awarded: false, reason: 'already-complete' };
    for (let i = 0; i < index; i += 1) {
      if (!have.has(KEYS[i])) return { awarded: false, reason: 'prerequisite-missing' };
    }

    const row = stmt('SELECT id, points FROM challenges WHERE key = ?').get(key);
    const started = stmt('SELECT started_at FROM competition_progress WHERE user_id = ?').get(userId).started_at;
    if (!started) {
      stmt(`UPDATE competition_progress SET started_at = ? WHERE user_id = ?`).run(now, userId);
      logEvent(userId, 'started', null, now);
    }
    stmt('INSERT INTO challenge_progress (user_id, challenge_id, completed_at, points_awarded) VALUES (?, ?, ?, ?)')
      .run(userId, row.id, now, row.points);

    const totals = stmt(`SELECT COALESCE(SUM(points_awarded), 0) AS score, COUNT(*) AS solved
      FROM challenge_progress WHERE user_id = ?`).get(userId);
    const complete = totals.solved >= KEYS.length;
    stmt(`UPDATE competition_progress SET score = ?, solved_count = ?, last_solve_at = ?,
      completion_status = ?, finished_at = CASE WHEN ? THEN ? ELSE finished_at END WHERE user_id = ?`)
      .run(totals.score, totals.solved, now, complete ? 'completed' : 'in_progress', complete ? 1 : 0, now, userId);
    logEvent(userId, 'solved', key, now);
    if (complete) logEvent(userId, 'completed', null, now);
    return { awarded: true, points: row.points, score: totals.score, solved: totals.solved, completed: complete };
  });
  if (result.awarded) announceChange('solve');
  return result;
}

// ---------------------------------------------------------------- per-player views
function solveTimes(rows, startedAt) {
  let previous = startedAt;
  return rows.map((r) => {
    const ms = previous ? Math.max(0, r.completed_at - previous) : null;
    previous = r.completed_at;
    return ms;
  });
}

function playerChallenges(userId) {
  const progress = stmt('SELECT started_at FROM competition_progress WHERE user_id = ?').get(userId);
  const rows = completedRows(userId);
  const times = solveTimes(rows, progress && progress.started_at);
  const byKey = new Map(rows.map((r, i) => [r.key, { row: r, ms: times[i] }]));
  let currentAssigned = false;
  return CHALLENGES.map((c) => {
    const hit = byKey.get(c.key);
    let status = 'locked';
    if (hit) status = 'solved';
    else if (!currentAssigned) { status = 'current'; currentAssigned = true; }
    return {
      key: c.key, stage: c.stage, name: c.name, summary: c.summary, points: c.points, status,
      completedAt: hit ? hit.row.completed_at : null, solveMs: hit ? hit.ms : null,
    };
  });
}

function elapsedFor(progress, now) {
  if (!progress || !progress.started_at) return { ms: 0, running: false };
  if (progress.finished_at) return { ms: progress.finished_at - progress.started_at, running: false };
  return { ms: Math.max(0, now - progress.started_at), running: true };
}

const RANK_ORDER = 'cp.score DESC, COALESCE(cp.last_solve_at, cp.started_at) ASC, u.id ASC';
const ELIGIBLE = `u.role = 'user' AND u.account_status = 'active' AND cp.started_at IS NOT NULL`;

function overallRank(userId) {
  const row = stmt(`SELECT rank FROM (
    SELECT u.id AS id, ROW_NUMBER() OVER (ORDER BY ${RANK_ORDER}) AS rank
    FROM users u JOIN competition_progress cp ON cp.user_id = u.id WHERE ${ELIGIBLE}
  ) WHERE id = ?`).get(userId);
  return row ? row.rank : null;
}

function participantCount() {
  return stmt(`SELECT COUNT(*) AS n FROM users u JOIN competition_progress cp ON cp.user_id = u.id WHERE ${ELIGIBLE}`).get().n;
}

function dashboard(user, now = Date.now()) {
  ensureCompetitionRow(user.id);
  const progress = stmt('SELECT * FROM competition_progress WHERE user_id = ?').get(user.id);
  const challenges = playerChallenges(user.id);
  const solved = challenges.filter((c) => c.status === 'solved');
  const latest = solved.length ? solved.reduce((a, b) => (b.completedAt > a.completedAt ? b : a)) : null;
  const current = challenges.find((c) => c.status === 'current') || null;
  const elapsed = elapsedFor(progress, now);
  const events = stmt(`SELECT type, detail, created_at FROM player_events WHERE user_id = ?
    ORDER BY created_at DESC, id DESC LIMIT 12`).all(user.id).map((e) => ({
    type: e.type, detail: e.detail, at: e.created_at,
    label: eventLabel(e),
  }));
  return {
    user: { username: user.username, email: user.email, createdAt: user.createdAt, status: user.status, role: user.role },
    status: progress.completion_status, disqualified: user.status === 'disqualified',
    score: progress.score, maxScore: TOTAL_POINTS, solved: solved.length, total: challenges.length,
    remaining: challenges.length - solved.length,
    percent: Math.round((solved.length / challenges.length) * 100),
    rank: user.status === 'active' ? overallRank(user.id) : null,
    participants: participantCount(),
    startedAt: progress.started_at, finishedAt: progress.finished_at,
    elapsedMs: elapsed.ms, running: elapsed.running,
    latest: latest && { name: latest.name, key: latest.key, points: latest.points, at: latest.completedAt },
    current, challenges, recent: events, serverTime: now,
  };
}

function eventLabel(e) {
  const challenge = CHALLENGES.find((c) => c.key === e.detail);
  switch (e.type) {
    case 'registered': return 'Account created';
    case 'login': return 'Signed in';
    case 'started': return 'Started the CTF';
    case 'solved': return challenge ? 'Completed ' + challenge.name + ' (+' + challenge.points + ')' : 'Completed a challenge';
    case 'completed': return 'Finished every challenge';
    case 'reset': return 'Progress reset by an organiser';
    default: return e.type;
  }
}

// ---------------------------------------------------------------- leaderboards
function likePattern(q) {
  return '%' + String(q).replace(/[\\%_]/g, (m) => '\\' + m) + '%';
}

function shapeRow(r, now) {
  const elapsed = elapsedFor(r, now);
  return {
    rank: r.rank, username: r.username, score: r.score, solved: r.solved_count, total: KEYS.length,
    status: r.completion_status, startedAt: r.started_at, finishedAt: r.finished_at, lastSolveAt: r.last_solve_at,
    elapsedMs: elapsed.ms, running: elapsed.running,
  };
}

const BASE_COLUMNS = `u.id AS user_id, u.username, cp.score, cp.solved_count, cp.completion_status,
  cp.started_at, cp.finished_at, cp.last_solve_at`;

// mode "overall": score, then who reached it first. mode "fastest": finishers by total run time.
function leaderboard({ mode = 'overall', page = 1, pageSize = 25, q = '', viewerId = null, now = Date.now() } = {}) {
  const fastest = mode === 'fastest';
  const order = fastest ? '(cp.finished_at - cp.started_at) ASC, cp.finished_at ASC, u.id ASC' : RANK_ORDER;
  const where = fastest ? `${ELIGIBLE} AND cp.completion_status = 'completed'` : ELIGIBLE;
  const size = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const total = stmt(`SELECT COUNT(*) AS n FROM users u JOIN competition_progress cp ON cp.user_id = u.id WHERE ${where}`).get().n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages, Math.max(1, Number(page) || 1));

  const ranked = `WITH ranked AS (
    SELECT ${BASE_COLUMNS}, ROW_NUMBER() OVER (ORDER BY ${order}) AS rank
    FROM users u JOIN competition_progress cp ON cp.user_id = u.id WHERE ${where})`;
  let rows; let matches = total;
  if (q) {
    const pattern = likePattern(q);
    matches = stmt(`${ranked} SELECT COUNT(*) AS n FROM ranked WHERE username LIKE ? ESCAPE '\\'`).get(pattern).n;
    rows = stmt(`${ranked} SELECT * FROM ranked WHERE username LIKE ? ESCAPE '\\' ORDER BY rank LIMIT ? OFFSET ?`)
      .all(pattern, size, (current - 1) * size);
  } else {
    rows = stmt(`${ranked} SELECT * FROM ranked ORDER BY rank LIMIT ? OFFSET ?`).all(size, (current - 1) * size);
  }

  let me = null;
  if (viewerId) {
    const mine = stmt(`${ranked} SELECT * FROM ranked WHERE user_id = ?`).get(viewerId);
    if (mine) me = shapeRow(mine, now);
  }
  return {
    mode: fastest ? 'fastest' : 'overall', page: current, pageSize: size, total, matches,
    pages: q ? Math.max(1, Math.ceil(matches / size)) : pages,
    rows: rows.map((r) => shapeRow(r, now)), me, serverTime: now,
    maxScore: TOTAL_POINTS, challengeCount: KEYS.length,
  };
}

// Removes a player's scored progress. Used by the admin reset.
function resetProgress(userId, now = Date.now()) {
  transaction(() => {
    stmt('DELETE FROM challenge_progress WHERE user_id = ?').run(userId);
    ensureCompetitionRow(userId);
    stmt(`UPDATE competition_progress SET started_at = NULL, finished_at = NULL, score = 0, solved_count = 0,
      last_solve_at = NULL, completion_status = 'not_started' WHERE user_id = ?`).run(userId);
    logEvent(userId, 'reset', null, now);
  });
  announceChange('reset');
}

module.exports = {
  bus, announceChange, recordSolve, startCompetition, progressLock, playerChallenges, dashboard,
  leaderboard, overallRank, resetProgress, elapsedFor, ensureCompetitionRow, completedRows,
  shapeRow, likePattern, RANK_ORDER, ELIGIBLE, BASE_COLUMNS,
};
