(function () {
  'use strict';
  var h = RC.h;
  var view = document.getElementById('view');
  var current = (location.pathname.replace(/\/+$/, '').split('/')[2]) || 'overview';
  var refresh = null;

  function head(title, sub, extra) {
    return h('div', { class: 'page-head' }, h('div', null, h('h1', { text: title }), sub ? h('p', { text: sub }) : null), extra || null);
  }
  function tile(label, value, sub) {
    return h('div', { class: 'panel tile' }, h('span', { class: 'label', text: label }), h('span', { class: 'value', text: value }), h('span', { class: 'sub', text: sub || '' }));
  }
  function table(cols, rows, emptyText) {
    var body = h('tbody');
    if (!rows.length) body.appendChild(h('tr', null, h('td', { colspan: cols.length, class: 'empty', text: emptyText || 'Nothing to show.' })));
    rows.forEach(function (r) { body.appendChild(r); });
    return h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', class: c[1] || null, text: c[0] }); }))), body));
  }
  function td(content, cls) { return h('td', { class: cls || null }, content); }
  function pager(d, go) {
    return h('div', { class: 'pager' }, h('span', { text: 'Page ' + d.page + ' of ' + d.pages + ' · ' + d.total + ' total' }),
      h('div', null,
        h('button', { class: 'btn small ghost', type: 'button', disabled: d.page <= 1, onclick: function () { go(d.page - 1); }, text: 'Previous' }),
        h('button', { class: 'btn small ghost', type: 'button', disabled: d.page >= d.pages, onclick: function () { go(d.page + 1); }, text: 'Next' })));
  }
  function flagBadges(flags) {
    if (!flags || !flags.length) return h('span', { class: 'muted', text: '--' });
    return h('span', { class: 'badge warn', title: flags.map(function (f) { return f.detail; }).join('\n'), text: flags.length + (flags.length === 1 ? ' flag' : ' flags') });
  }
  function mount(nodes) { RC.clear(view); nodes.forEach(function (n) { view.appendChild(n); }); }
  function fail(r) { mount([head('Something went wrong'), h('p', { class: 'banner', text: (r && r.data && r.data.error) || 'Could not load this view.' })]); }

  // ---------------------------------------------------------------- overview
  function overview() {
    RC.api('/admin/overview').then(function (r) {
      if (!r.ok) return fail(r);
      var o = r.data;
      RC.syncClock(o.serverTime);
      mount([
        head('Overview', 'Live state of the competition.', h('span', { class: 'live', id: 'live' }, h('i'), 'Live')),
        h('section', { class: 'grid cols-4' },
          tile('Players', o.players, o.onlineNow + ' online now'),
          tile('In progress', o.inProgress, o.notStarted + ' not started'),
          tile('Completed', o.completed, o.averageCompletionMs ? 'Avg ' + RC.duration(o.averageCompletionMs) : 'No finishers yet'),
          tile('Total solves', o.totalSolves, o.challengeCount + ' challenges · ' + o.maxScore + ' pts max')),
        h('section', { class: 'grid cols-3' },
          tile('Top player', o.topPlayer ? o.topPlayer.username : '--', o.topPlayer ? o.topPlayer.score + ' pts' : ''),
          tile('Fastest finisher', o.fastestFinisher ? o.fastestFinisher.username : '--', o.fastestFinisher ? RC.duration(o.fastestFinisher.elapsedMs || o.fastestFinisher.ms) : ''),
          tile('Needs review', o.suspiciousPlayers, o.suspended + ' suspended · ' + o.disqualified + ' disqualified')),
      ]);
      RC.live(overview, document.getElementById('live'));
    });
  }

  // ---------------------------------------------------------------- players
  var pf = { q: '', status: '', progress: '', sort: 'newest', page: 1 };
  function select(name, options, value, onchange, label) {
    var el = h('select', { name: name, 'aria-label': label }, options.map(function (o) { return h('option', { value: o[0], selected: o[0] === value, text: o[1] }); }));
    el.addEventListener('change', function () { onchange(el.value); });
    return el;
  }
  function players() {
    var body = h('div');
    var search = h('input', { class: 'search', type: 'search', placeholder: 'Search username or email', value: pf.q, 'aria-label': 'Search players', maxlength: 60 });
    search.addEventListener('input', RC.debounce(function () { pf.q = search.value.trim(); pf.page = 1; loadPlayers(body); }, 250));
    mount([head('Players', 'Every registered player. Open a row to review progress or take action.'),
      h('section', { class: 'panel' },
        h('div', { class: 'toolbar', style: 'margin-bottom:14px' }, search,
          select('status', [['', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended'], ['disqualified', 'Disqualified']], pf.status, function (v) { pf.status = v; pf.page = 1; loadPlayers(body); }, 'Filter by status'),
          select('progress', [['', 'Any progress'], ['not_started', 'Not started'], ['in_progress', 'In progress'], ['completed', 'Completed']], pf.progress, function (v) { pf.progress = v; pf.page = 1; loadPlayers(body); }, 'Filter by progress'),
          select('sort', [['newest', 'Newest'], ['username', 'Username'], ['score', 'Score'], ['recent', 'Last login']], pf.sort, function (v) { pf.sort = v; loadPlayers(body); }, 'Sort')),
        body)]);
    loadPlayers(body);
    refresh = function () { loadPlayers(body); };
  }
  function loadPlayers(body) {
    var qs = '?q=' + encodeURIComponent(pf.q) + '&status=' + pf.status + '&progress=' + pf.progress + '&sort=' + pf.sort + '&page=' + pf.page;
    RC.api('/admin/users' + qs).then(function (r) {
      if (!r.ok) return;
      var d = r.data;
      RC.clear(body);
      body.appendChild(table([['Player'], ['Email'], ['Status'], ['Progress'], ['Score', 'num'], ['Last login'], ['Flags'], ['']], d.rows.map(function (u) {
        return h('tr', null, td(u.username), td(u.email), td(RC.statusBadge(u.status)), td(RC.statusBadge(u.progress)),
          td(u.score + ' · ' + u.solved + '/' + d.challengeCount, 'num'), td(u.lastLoginAt ? RC.dateTime(u.lastLoginAt) : 'Never'), td(flagBadges(u.flagCount ? new Array(u.flagCount).fill({ detail: 'Open the player for details' }) : [])),
          td(h('button', { class: 'btn small', type: 'button', onclick: function () { openPlayer(u.id); }, text: 'Open' })));
      }), 'No players match these filters.'));
      body.appendChild(pager(d, function (p) { pf.page = p; loadPlayers(body); }));
    });
  }

  function openPlayer(id) {
    RC.api('/admin/users/' + id).then(function (r) {
      if (!r.ok) return RC.toast((r.data && r.data.error) || 'Could not load player', true);
      var d = r.data, u = d.user, dash = d.dashboard;
      var reason = h('textarea', { id: 'reason', maxlength: 500, placeholder: 'Reason (required, saved to the audit log)' });
      var err = h('p', { class: 'form-msg error', role: 'alert' });
      var overlay;
      function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
      function onKey(e) { if (e.key === 'Escape') close(); }
      function act(path, body, okText) {
        RC.api(path, { body: body, quiet: true }).then(function (res) {
          if (!res.ok) { err.textContent = res.data.error || 'Action failed.'; return; }
          RC.toast(okText); close(); if (refresh) refresh();
        });
      }
      function statusBtn(label, status, cls) {
        return h('button', { class: 'btn small ' + cls, type: 'button', disabled: u.status === status, onclick: function () { act('/admin/users/' + id + '/status', { status: status, reason: reason.value }, 'Status set to ' + status); }, text: label });
      }
      var resetBtn = h('button', { class: 'btn small danger', type: 'button', onclick: function () {
        var typed = window.prompt('This erases ' + u.username + "'s scored progress. Type their username to confirm.");
        if (typed === null) return;
        act('/admin/users/' + id + '/reset', { reason: reason.value, confirm: typed }, 'Progress reset');
      }, text: 'Reset progress' });

      overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Player ' + u.username, onclick: function (e) { if (e.target === overlay) close(); } },
        h('div', { class: 'panel modal' },
          h('div', { class: 'panel-head' }, h('h2', { text: u.username }), h('button', { class: 'btn small ghost', type: 'button', onclick: close, text: 'Close' })),
          h('p', { class: 'muted', text: u.email + ' · joined ' + RC.dateTime(u.createdAt) + ' · last login ' + (u.lastLoginAt ? RC.dateTime(u.lastLoginAt) : 'never') }),
          h('div', { class: 'grid cols-4', style: 'margin:14px 0' },
            tile('Status', u.status), tile('Score', dash.score + ' / ' + dash.maxScore), tile('Solved', dash.solved + ' / ' + dash.total), tile('Time', RC.duration(dash.elapsedMs))),
          d.flags && d.flags.length ? h('div', { class: 'banner warn', style: 'margin-bottom:14px' }, h('strong', { text: 'Review flags' }), h('ul', { style: 'margin:6px 0 0;padding-left:18px' }, d.flags.map(function (f) { return h('li', { text: f.detail }); }))) : null,
          table([['Challenge'], ['Status'], ['Solved at'], ['Step time', 'num']], dash.challenges.map(function (c) {
            return h('tr', null, td(c.name), td(h('span', { class: 'badge ' + (c.status === 'solved' ? 'ok' : c.status === 'current' ? 'cyan' : ''), text: c.status })), td(RC.dateTime(c.completedAt)), td(c.solveMs === null ? '--' : RC.duration(c.solveMs), 'num'));
          })),
          h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { for: 'reason', text: 'Moderation reason' }), reason),
          err,
          h('div', { class: 'modal-actions' }, statusBtn('Reinstate', 'active', ''), statusBtn('Suspend', 'suspended', 'violet'), statusBtn('Disqualify', 'disqualified', 'danger'), resetBtn)));
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
      reason.focus();
    });
  }

  // ---------------------------------------------------------------- challenges
  function challenges() {
    RC.api('/admin/challenges').then(function (r) {
      if (!r.ok) return fail(r);
      var d = r.data;
      mount([head('Challenges', d.startedPlayers + ' players have started.'),
        h('section', { class: 'panel' }, table([['Stage'], ['Challenge'], ['Points', 'num'], ['Completions', 'num'], ['Rate', 'num'], ['Avg step', 'num'], ['Fastest', 'num'], ['Last solve']],
          d.challenges.map(function (c) {
            return h('tr', null, td(c.stage === 0 ? 'Entry' : c.stage), td(h('div', null, h('strong', { text: c.name }), h('div', { class: 'muted', text: c.summary }))), td(c.points, 'num'), td(c.completions, 'num'),
              td(c.completionRate + '%', 'num'), td(c.averageSolveMs === null ? '--' : RC.duration(c.averageSolveMs), 'num'), td(c.fastestSolveMs === null ? '--' : RC.duration(c.fastestSolveMs), 'num'), td(c.lastSolveAt ? RC.dateTime(c.lastSolveAt) : '--'));
          })))]);
    });
  }

  // ---------------------------------------------------------------- leaderboard
  var lf = { mode: 'overall', q: '', page: 1 };
  function leaderboard() {
    var body = h('div');
    var search = h('input', { class: 'search', type: 'search', placeholder: 'Search players', value: lf.q, 'aria-label': 'Search players', maxlength: 40 });
    search.addEventListener('input', RC.debounce(function () { lf.q = search.value.trim(); lf.page = 1; loadBoard(body); }, 250));
    var tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Ranking mode' }, ['overall', 'fastest'].map(function (m) {
      return h('button', { type: 'button', 'aria-pressed': String(lf.mode === m), text: m === 'overall' ? 'Overall' : 'Fastest', onclick: function () { lf.mode = m; lf.page = 1; leaderboard(); } });
    }));
    mount([head('Leaderboard', 'Same rankings players see, plus review flags.', h('a', { class: 'btn', href: '/api/platform/admin/export.csv?mode=' + lf.mode, text: 'Export CSV' })),
      h('section', { class: 'panel' }, h('div', { class: 'toolbar', style: 'margin-bottom:14px' }, tabs, search), body)]);
    loadBoard(body);
    refresh = function () { loadBoard(body); };
    RC.live(function () { if (refresh) refresh(); });
  }
  function loadBoard(body) {
    RC.api('/admin/leaderboard?mode=' + lf.mode + '&page=' + lf.page + '&q=' + encodeURIComponent(lf.q)).then(function (r) {
      if (!r.ok) return;
      var d = r.data;
      RC.clear(body);
      body.appendChild(table([['Rank'], ['Player'], ['Score', 'num'], ['Solved', 'num'], ['Time', 'num'], ['Status'], ['Flags']], d.rows.map(function (u) {
        return h('tr', { style: 'cursor:pointer', onclick: function () { openPlayer(u.userId); } }, td(h('span', { class: 'rank', text: '#' + u.rank })), td(u.username), td(u.score, 'num'), td(u.solved + '/' + u.total, 'num'),
          td(u.startedAt ? RC.duration(u.elapsedMs) : '--', 'num'), td(RC.statusBadge(u.status)), td(flagBadges(u.flags)));
      }), 'No players yet.'));
      if (d.excluded && d.excluded.length) body.appendChild(h('p', { class: 'muted', style: 'margin-top:12px', text: 'Excluded from public rankings: ' + d.excluded.map(function (e) { return e.username + ' (' + e.status + ')'; }).join(', ') }));
      body.appendChild(pager({ page: d.page, pages: d.pages, total: d.matches }, function (p) { lf.page = p; loadBoard(body); }));
    });
  }

  // ---------------------------------------------------------------- analytics
  function bars(items, valueKey, labelFn) {
    var max = Math.max.apply(null, items.map(function (i) { return i[valueKey]; }).concat([1]));
    return h('div', null,
      h('div', { class: 'chart', role: 'img', 'aria-label': 'Bar chart' }, items.map(function (i) {
        return h('div', { class: 'col', title: labelFn(i) + ': ' + i[valueKey] }, h('span', { style: 'height:' + (i[valueKey] / max) * 100 + '%' }));
      })),
      h('div', { class: 'chart-axis' }, h('span', { text: labelFn(items[0]) }), h('span', { text: labelFn(items[items.length - 1]) })));
  }
  function analytics() {
    RC.api('/admin/analytics').then(function (r) {
      if (!r.ok) return fail(r);
      var d = r.data;
      var top = Math.max.apply(null, d.funnel.map(function (f) { return f.completions; }).concat([1]));
      mount([head('Analytics', 'Activity over the last day and fortnight.'),
        h('div', { class: 'grid cols-2' },
          h('section', { class: 'panel' }, h('h2', { text: 'Solves per hour (24h)' }), bars(d.solvesByHour, 'solves', function (i) { return new Date(i.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); })),
          h('section', { class: 'panel' }, h('h2', { text: 'Registrations per day (14d)' }), bars(d.registrationsByDay, 'registrations', function (i) { return new Date(i.at).toLocaleDateString([], { month: 'short', day: 'numeric' }); }))),
        h('div', { class: 'grid cols-2' },
          h('section', { class: 'panel' }, h('h2', { text: 'Score distribution' }), bars(d.scoreBuckets, 'players', function (i) { return i.from + '-' + i.to; })),
          h('section', { class: 'panel' }, h('h2', { text: 'Completion funnel' }), d.funnel.map(function (f) {
            return h('div', { class: 'hbar' }, h('span', { text: f.name }), h('div', { class: 'bar' }, h('span', { style: 'width:' + (f.completions / top) * 100 + '%' })), h('span', { class: 'num', text: f.completions }));
          })))]);
    });
  }

  // ---------------------------------------------------------------- audit
  var auditPage = 1;
  function audit() {
    RC.api('/admin/audit?page=' + auditPage).then(function (r) {
      if (!r.ok) return fail(r);
      var d = r.data;
      mount([head('Audit log', 'Every moderation action, newest first.'),
        h('section', { class: 'panel' }, table([['When'], ['Organiser'], ['Action'], ['Target'], ['Reason']], d.rows.map(function (a) {
          return h('tr', null, td(RC.dateTime(a.at)), td(a.admin || '--'), td(h('span', { class: 'badge cyan', text: a.action })), td(a.target || '--'), td(a.reason || '--'));
        }), 'No actions recorded yet.'), pager(d, function (p) { auditPage = p; audit(); }))]);
    });
  }

  // ---------------------------------------------------------------- settings
  function settings() {
    RC.api('/admin/settings').then(function (r) {
      if (!r.ok) return fail(r);
      var s = r.data;
      var toggle = h('button', { class: 'btn ' + (s.registrationOpen ? 'danger' : 'primary'), type: 'button', text: s.registrationOpen ? 'Close registration' : 'Open registration', onclick: function () {
        RC.api('/admin/settings', { body: { registrationOpen: !s.registrationOpen } }).then(function (res) { if (res.ok) { RC.toast('Registration ' + (res.data.registrationOpen ? 'opened' : 'closed')); settings(); } });
      } });
      mount([head('Settings', 'Platform configuration.'),
        h('div', { class: 'grid cols-2' },
          h('section', { class: 'panel' }, h('h2', { text: 'Registration' }),
            h('p', { class: 'muted', style: 'margin-bottom:12px', text: 'New sign-ups are currently ' + (s.registrationOpen ? 'open.' : 'closed.') }), toggle),
          h('section', { class: 'panel' }, h('h2', { text: 'Security' }),
            h('p', { text: 'Password hashing: ' + s.algorithm }), h('p', { text: 'Active sessions: ' + s.sessions }), h('p', { class: 'muted', text: 'Database: ' + s.databaseFile }))),
        h('section', { class: 'panel' }, h('h2', { text: 'Scoring' }), table([['Stage'], ['Challenge'], ['Points', 'num'], ['Server check']], s.scoring.map(function (c) {
          return h('tr', null, td(c.stage), td(c.name), td(c.points, 'num'), td(h('code', { text: c.reference })));
        }))),
        h('section', { class: 'panel' }, h('h2', { text: 'Organiser accounts' }), table([['Username'], ['Email'], ['Last login']], s.admins.map(function (a) {
          return h('tr', null, td(a.username), td(a.email), td(a.lastLoginAt ? RC.dateTime(a.lastLoginAt) : 'Never'));
        }), 'No organiser accounts.'))]);
    });
  }

  var VIEWS = { overview: overview, players: players, challenges: challenges, leaderboard: leaderboard, analytics: analytics, audit: audit, settings: settings };
  RC.boot({ require: true }).then(function (me) {
    if (me.user.role !== 'admin') { window.location.replace('/dashboard'); return; }
    document.title = (current === 'overview' ? 'Overview' : current.charAt(0).toUpperCase() + current.slice(1)) + ' | Organiser console';
    (VIEWS[current] || overview)();
  });
})();
