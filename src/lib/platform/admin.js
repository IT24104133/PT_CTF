'use strict';
// Organiser-only queries and actions. Every state change writes an audit record.

const { stmt, transaction, getSetting, setSetting, dbPath } = require('./db');
const { CHALLENGES, KEYS, TOTAL_POINTS } = require('./catalog');
const scoring = require('./scoring');
const auth = require('./auth');

const FAST_SOLVE_MS = 15 * 1000;
const FAST_TOTAL_MS = 10 * 60 * 1000;
const BURST_WINDOW_MS = 60 * 1000;

function audit(adminId, action, targetUserId, reason, detail, now = Date.now()) {
  stmt(`INSERT INTO admin_audit_logs (admin_id, action, target_user_id, reason, detail, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)`).run(adminId, action, targetUserId || null, reason || null, detail ? JSON.stringify(detail) : null, now);
}

// ---------------------------------------------------------------- suspicious patterns
function suspiciousFlags() {
  const rows = stmt(`SELECT u.id AS user_id, u.username, cp.started_at, cp.finished_at, c.key, pr.completed_at
    FROM challenge_progress pr
    JOIN users u ON u.id = pr.user_id
    JOIN challenges c ON c.id = pr.challenge_id
    JOIN competition_progress cp ON cp.user_id = u.id
    WHERE u.role = 'user' ORDER BY u.id, c.sort_order`).all();
  const flags = new Map();
  const add = (id, type, detail) => {
    if (!flags.has(id)) flags.set(id, []);
    flags.get(id).push({ type, detail });
  };
  let current = null; let previous = null; let times = [];
  const flush = () => {
    if (!current) return;
    for (let i = 0; i + 2 < times.length; i += 1) {
      if (times[i + 2] - times[i] <= BURST_WINDOW_MS) { add(current.user_id, 'burst', 'Three solves within one minute'); break; }
    }
    if (current.finished_at && current.started_at && current.finished_at - current.started_at < FAST_TOTAL_MS) {
      add(current.user_id, 'fast_total', 'Finished everything in under ' + Math.round(FAST_TOTAL_MS / 60000) + ' minutes');
    }
  };
  for (const r of rows) {
    if (!current || current.user_id !== r.user_id) { flush(); current = r; previous = r.started_at; times = []; }
    if (previous && r.completed_at - previous < FAST_SOLVE_MS) {
      add(r.user_id, 'fast_solve', r.key + ' solved ' + Math.max(0, Math.round((r.completed_at - previous) / 1000)) + 's after the previous step');
    }
    previous = r.completed_at;
    times.push(r.completed_at);
  }
  flush();
  return flags;
}

// ---------------------------------------------------------------- overview and analytics
function overview(now = Date.now()) {
  const q = (sql, ...args) => stmt(sql).get(...args);
  const players = q("SELECT COUNT(*) AS n FROM users WHERE role = 'user'").n;
  const byStatus = q(`SELECT
    SUM(CASE WHEN u.account_status = 'suspended' THEN 1 ELSE 0 END) AS suspended,
    SUM(CASE WHEN u.account_status = 'disqualified' THEN 1 ELSE 0 END) AS disqualified
    FROM users u WHERE u.role = 'user'`);
  const progress = q(`SELECT
    SUM(CASE WHEN cp.completion_status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN cp.completion_status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
    SUM(CASE WHEN cp.completion_status = 'not_started' THEN 1 ELSE 0 END) AS not_started,
    AVG(CASE WHEN cp.completion_status = 'completed' THEN cp.finished_at - cp.started_at END) AS avg_ms
    FROM competition_progress cp JOIN users u ON u.id = cp.user_id WHERE u.role = 'user'`);
  const online = q(`SELECT COUNT(DISTINCT s.user_id) AS n FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE u.role = 'user' AND s.last_seen_at > ? AND s.expires_at > ?`, now - 15 * 60 * 1000, now).n;
  const solves = q('SELECT COUNT(*) AS n FROM challenge_progress').n;
  const top = scoring.leaderboard({ pageSize: 1 }).rows[0] || null;
  const fastest = scoring.leaderboard({ mode: 'fastest', pageSize: 1 }).rows[0] || null;
  return {
    players, onlineNow: online, inProgress: progress.in_progress || 0, completed: progress.completed || 0,
    notStarted: progress.not_started || 0, suspended: byStatus.suspended || 0, disqualified: byStatus.disqualified || 0,
    totalSolves: solves, challengeCount: KEYS.length, maxScore: TOTAL_POINTS,
    averageCompletionMs: progress.avg_ms ? Math.round(progress.avg_ms) : null,
    topPlayer: top && { username: top.username, score: top.score },
    fastestFinisher: fastest && { username: fastest.username, elapsedMs: fastest.elapsedMs },
    suspiciousPlayers: suspiciousFlags().size, serverTime: now,
  };
}

function challengeStats() {
  const started = stmt(`SELECT COUNT(*) AS n FROM competition_progress cp JOIN users u ON u.id = cp.user_id
    WHERE u.role = 'user' AND cp.started_at IS NOT NULL`).get().n;
  const rows = stmt(`SELECT c.key, pr.user_id, pr.completed_at,
      COALESCE(LAG(pr.completed_at) OVER (PARTITION BY pr.user_id ORDER BY c.sort_order), cp.started_at) AS prev_at
    FROM challenge_progress pr JOIN challenges c ON c.id = pr.challenge_id
    JOIN competition_progress cp ON cp.user_id = pr.user_id JOIN users u ON u.id = pr.user_id
    WHERE u.role = 'user'`).all();
  const grouped = new Map();
  for (const r of rows) {
    if (!grouped.has(r.key)) grouped.set(r.key, []);
    grouped.get(r.key).push(r);
  }
  return {
    startedPlayers: started,
    challenges: CHALLENGES.map((c) => {
      const list = grouped.get(c.key) || [];
      const times = list.filter((r) => r.prev_at).map((r) => Math.max(0, r.completed_at - r.prev_at));
      return {
        key: c.key, stage: c.stage, name: c.name, points: c.points, reference: c.ref, summary: c.summary,
        completions: list.length, completionRate: started ? Math.round((list.length / started) * 100) : 0,
        averageSolveMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
        fastestSolveMs: times.length ? Math.min(...times) : null,
        lastSolveAt: list.length ? Math.max(...list.map((r) => r.completed_at)) : null,
      };
    }),
  };
}

function analytics(now = Date.now()) {
  const hour = 60 * 60 * 1000; const day = 24 * hour;
  const hours = [];
  const hourStart = Math.floor(now / hour) * hour - 23 * hour;
  for (let i = 0; i < 24; i += 1) hours.push({ at: hourStart + i * hour, solves: 0 });
  for (const r of stmt('SELECT completed_at FROM challenge_progress WHERE completed_at >= ?').all(hourStart)) {
    const slot = hours[Math.min(23, Math.floor((r.completed_at - hourStart) / hour))];
    if (slot) slot.solves += 1;
  }
  const dayStart = Math.floor(now / day) * day - 13 * day;
  const days = [];
  for (let i = 0; i < 14; i += 1) days.push({ at: dayStart + i * day, registrations: 0 });
  for (const r of stmt("SELECT created_at FROM users WHERE role = 'user' AND created_at >= ?").all(dayStart)) {
    const slot = days[Math.min(13, Math.floor((r.created_at - dayStart) / day))];
    if (slot) slot.registrations += 1;
  }
  const bucketSize = Math.max(1, Math.ceil(TOTAL_POINTS / 7 / 50) * 50);
  const buckets = [];
  for (let from = 0; from < TOTAL_POINTS + bucketSize; from += bucketSize) buckets.push({ from, to: from + bucketSize - 1, players: 0 });
  for (const r of stmt(`SELECT cp.score FROM competition_progress cp JOIN users u ON u.id = cp.user_id
    WHERE u.role = 'user' AND cp.started_at IS NOT NULL`).all()) {
    const slot = buckets[Math.floor(r.score / bucketSize)];
    if (slot) slot.players += 1;
  }
  const stats = challengeStats();
  return {
    solvesByHour: hours, registrationsByDay: days, scoreBuckets: buckets.filter((b, i) => b.players || i < 8),
    funnel: stats.challenges.map((c) => ({ key: c.key, name: c.name, completions: c.completions })),
    startedPlayers: stats.startedPlayers, serverTime: now,
  };
}

// ---------------------------------------------------------------- users
const USER_SORTS = {
  newest: 'u.created_at DESC', username: 'u.username COLLATE NOCASE ASC', score: 'cp.score DESC, u.id ASC',
  recent: 'COALESCE(u.last_login_at, 0) DESC',
};

function listUsers({ q = '', status = '', progress = '', sort = 'newest', page = 1, pageSize = 25 } = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const where = ["u.role = 'user'"]; const args = [];
  if (q) { where.push("(u.username LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); const p = scoring.likePattern(q); args.push(p, p); }
  if (['active', 'suspended', 'disqualified'].includes(status)) { where.push('u.account_status = ?'); args.push(status); }
  if (['not_started', 'in_progress', 'completed'].includes(progress)) { where.push('cp.completion_status = ?'); args.push(progress); }
  const from = `FROM users u LEFT JOIN competition_progress cp ON cp.user_id = u.id WHERE ${where.join(' AND ')}`;
  const total = stmt(`SELECT COUNT(*) AS n ${from}`).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages, Math.max(1, Number(page) || 1));
  const flags = suspiciousFlags();
  const rows = stmt(`SELECT u.id, u.username, u.email, u.account_status, u.created_at, u.last_login_at,
      COALESCE(cp.score, 0) AS score, COALESCE(cp.solved_count, 0) AS solved, cp.completion_status, cp.started_at, cp.finished_at
    ${from} ORDER BY ${USER_SORTS[sort] || USER_SORTS.newest} LIMIT ? OFFSET ?`).all(...args, size, (current - 1) * size);
  return {
    total, page: current, pages, pageSize: size, challengeCount: KEYS.length,
    rows: rows.map((r) => ({
      id: r.id, username: r.username, email: r.email, status: r.account_status, createdAt: r.created_at,
      lastLoginAt: r.last_login_at, score: r.score, solved: r.solved, progress: r.completion_status || 'not_started',
      startedAt: r.started_at, finishedAt: r.finished_at, flagCount: (flags.get(r.id) || []).length,
    })),
  };
}

function getUser(id, now = Date.now()) {
  const user = stmt("SELECT * FROM users WHERE id = ? AND role = 'user'").get(id);
  if (!user) return null;
  const publicUser = auth.publicUser(user);
  const dash = scoring.dashboard(publicUser, now);
  const events = stmt(`SELECT type, detail, created_at FROM player_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`).all(id);
  const log = stmt(`SELECT a.action, a.reason, a.timestamp, adm.username AS admin FROM admin_audit_logs a
    LEFT JOIN users adm ON adm.id = a.admin_id WHERE a.target_user_id = ? ORDER BY a.timestamp DESC LIMIT 30`).all(id);
  return {
    user: publicUser, dashboard: dash, flags: suspiciousFlags().get(id) || [],
    events: events.map((e) => ({ type: e.type, detail: e.detail, at: e.created_at })),
    audit: log.map((a) => ({ action: a.action, reason: a.reason, at: a.timestamp, admin: a.admin })),
  };
}

// Changes an account's competition status, with a mandatory reason. Admins cannot be targeted.
function setStatus(adminId, targetId, status, reason, hooks = {}) {
  if (!['active', 'suspended', 'disqualified'].includes(status)) return { ok: false, status: 400, error: 'Unknown status.' };
  const note = typeof reason === 'string' ? reason.trim() : '';
  if (note.length < 3 || note.length > 500) return { ok: false, status: 400, error: 'Give a reason of 3 to 500 characters.' };
  const target = stmt("SELECT id, username, account_status FROM users WHERE id = ? AND role = 'user'").get(targetId);
  if (!target) return { ok: false, status: 404, error: 'Player not found.' };
  if (target.account_status === status) return { ok: false, status: 409, error: 'The account is already ' + status + '.' };
  transaction(() => {
    stmt('UPDATE users SET account_status = ? WHERE id = ?').run(status, targetId);
    audit(adminId, 'user.' + status, targetId, note, { from: target.account_status, to: status });
  });
  if (status === 'suspended') auth.destroyUserSessions(targetId);
  if (status !== 'active' && hooks.dropCtfSessions) hooks.dropCtfSessions(targetId);
  scoring.announceChange('status');
  return { ok: true };
}

function resetPlayer(adminId, targetId, reason, confirmUsername, hooks = {}) {
  const note = typeof reason === 'string' ? reason.trim() : '';
  if (note.length < 3 || note.length > 500) return { ok: false, status: 400, error: 'Give a reason of 3 to 500 characters.' };
  const target = stmt("SELECT id, username FROM users WHERE id = ? AND role = 'user'").get(targetId);
  if (!target) return { ok: false, status: 404, error: 'Player not found.' };
  if (String(confirmUsername || '').toLowerCase() !== target.username.toLowerCase()) {
    return { ok: false, status: 400, error: 'Type the player\'s username to confirm the reset.' };
  }
  const before = stmt('SELECT score, solved_count FROM competition_progress WHERE user_id = ?').get(targetId) || { score: 0, solved_count: 0 };
  scoring.resetProgress(targetId);
  audit(adminId, 'progress.reset', targetId, note, { previousScore: before.score, previousSolved: before.solved_count });
  if (hooks.dropCtfSessions) hooks.dropCtfSessions(targetId);
  return { ok: true };
}

// ---------------------------------------------------------------- leaderboard (admin view)
function adminLeaderboard({ mode = 'overall', page = 1, pageSize = 25, q = '' } = {}) {
  const board = scoring.leaderboard({ mode, page, pageSize, q });
  const flags = suspiciousFlags();
  const ids = new Map(stmt("SELECT id, username FROM users WHERE role = 'user'").all().map((u) => [u.username.toLowerCase(), u.id]));
  board.rows = board.rows.map((r) => {
    const id = ids.get(r.username.toLowerCase());
    return { ...r, userId: id, flags: flags.get(id) || [] };
  });
  board.excluded = stmt(`SELECT u.id, u.username, u.account_status, cp.score, cp.solved_count
    FROM users u JOIN competition_progress cp ON cp.user_id = u.id
    WHERE u.role = 'user' AND u.account_status <> 'active' AND cp.started_at IS NOT NULL ORDER BY cp.score DESC LIMIT 100`)
    .all().map((r) => ({ userId: r.id, username: r.username, status: r.account_status, score: r.score, solved: r.solved_count }));
  return board;
}

// ---------------------------------------------------------------- audit log, settings, export
function auditLog({ page = 1, pageSize = 30 } = {}) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || 30));
  const total = stmt('SELECT COUNT(*) AS n FROM admin_audit_logs').get().n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages, Math.max(1, Number(page) || 1));
  const rows = stmt(`SELECT a.id, a.action, a.reason, a.detail, a.timestamp, adm.username AS admin, tgt.username AS target
    FROM admin_audit_logs a LEFT JOIN users adm ON adm.id = a.admin_id LEFT JOIN users tgt ON tgt.id = a.target_user_id
    ORDER BY a.timestamp DESC, a.id DESC LIMIT ? OFFSET ?`).all(size, (current - 1) * size);
  return { total, page: current, pages, rows: rows.map((r) => ({
    id: r.id, action: r.action, reason: r.reason, admin: r.admin, target: r.target, at: r.timestamp,
  })) };
}

function settings() {
  const admins = stmt("SELECT username, email, last_login_at FROM users WHERE role = 'admin' ORDER BY id").all();
  return {
    registrationOpen: auth.registrationOpen(),
    algorithm: require('./passwords').algorithm,
    databasePath: process.env.PLATFORM_DB_PATH ? 'custom (PLATFORM_DB_PATH)' : 'data/db/platform.sqlite',
    databaseFile: require('node:path').basename(dbPath()),
    sessions: stmt('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?').get(Date.now()).n,
    scoring: CHALLENGES.map((c) => ({ key: c.key, stage: c.stage, name: c.name, points: c.points, reference: c.ref })),
    admins: admins.map((a) => ({ username: a.username, email: a.email, lastLoginAt: a.last_login_at })),
  };
}

function updateSettings(adminId, body) {
  if (typeof body.registrationOpen === 'boolean') {
    const before = auth.registrationOpen();
    if (before !== body.registrationOpen) {
      setSetting('registration_open', body.registrationOpen ? '1' : '0');
      audit(adminId, body.registrationOpen ? 'settings.registration_open' : 'settings.registration_closed', null, null);
    }
  }
  return settings();
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; // stop spreadsheet formula injection
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function iso(ms) { return ms ? new Date(ms).toISOString() : ''; }

function exportCsv(adminId, mode) {
  const fastest = mode === 'fastest';
  const board = scoring.leaderboard({ mode, page: 1, pageSize: 100 });
  const rows = [];
  for (let page = 1; page <= board.pages; page += 1) {
    rows.push(...(page === 1 ? board : scoring.leaderboard({ mode, page, pageSize: 100 })).rows);
  }
  const emails = new Map(stmt("SELECT username, email, account_status FROM users WHERE role = 'user'").all().map((u) => [u.username.toLowerCase(), u]));
  const completions = new Map();
  for (const r of stmt(`SELECT u.username, c.key, pr.completed_at FROM challenge_progress pr
    JOIN users u ON u.id = pr.user_id JOIN challenges c ON c.id = pr.challenge_id`).all()) {
    completions.set(r.username.toLowerCase() + '|' + r.key, r.completed_at);
  }
  const header = ['rank', 'username', 'email', 'status', 'score', 'challenges_solved', 'completion', 'started_at_utc',
    'finished_at_utc', 'last_solve_at_utc', 'total_time_seconds', ...KEYS.map((k) => k + '_completed_at_utc')];
  const lines = [header.join(',')];
  for (const r of rows) {
    const info = emails.get(r.username.toLowerCase()) || {};
    lines.push([
      r.rank, r.username, info.email, info.account_status, r.score, r.solved, r.status, iso(r.startedAt),
      iso(r.finishedAt), iso(r.lastSolveAt), r.finishedAt ? Math.round(r.elapsedMs / 1000) : '',
      ...KEYS.map((k) => iso(completions.get(r.username.toLowerCase() + '|' + k))),
    ].map(csvCell).join(','));
  }
  audit(adminId, 'leaderboard.export', null, null, { mode: fastest ? 'fastest' : 'overall', rows: rows.length });
  return lines.join('\r\n') + '\r\n';
}

module.exports = {
  audit, overview, challengeStats, analytics, listUsers, getUser, setStatus, resetPlayer, adminLeaderboard,
  auditLog, settings, updateSettings, exportCsv, suspiciousFlags, csvCell,
};
