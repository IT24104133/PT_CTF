(function () {
  'use strict';
  var h = RC.h;
  var state = { mode: 'overall', page: 1, q: '' };
  var rows = document.getElementById('rows');
  var latest = null;
  var localAt = 0;

  function rankCell(n) {
    return h('span', { class: 'rank' + (n <= 3 ? ' r' + n : ''), text: '#' + n });
  }

  function timeText(r) {
    if (!r.startedAt) return '--';
    return RC.duration(r.running ? r.elapsedMs + (Date.now() - localAt) : r.elapsedMs);
  }

  function row(r, isMe) {
    var pct = Math.round((r.solved / r.total) * 100);
    return h('tr', { class: isMe ? 'me' : null },
      h('td', null, rankCell(r.rank)),
      h('td', null, r.username, isMe ? h('span', { class: 'badge violet', style: 'margin-left:8px', text: 'You' }) : null),
      h('td', { class: 'num', text: r.score }),
      h('td', { style: 'min-width:140px' }, h('div', { class: 'bar', role: 'img', 'aria-label': r.solved + ' of ' + r.total + ' solved' }, h('span', { style: 'width:' + pct + '%' }))),
      h('td', { class: 'num time', 'data-id': r.username, text: timeText(r) }),
      h('td', null, RC.statusBadge(r.status)));
  }

  function render(d) {
    latest = d; localAt = Date.now();
    RC.syncClock(d.serverTime);
    RC.clear(rows);
    if (!d.rows.length) {
      rows.appendChild(h('tr', null, h('td', { colspan: 6, class: 'empty', text: state.q ? 'No players match your search.' : state.mode === 'fastest' ? 'Nobody has finished yet.' : 'No players on the board yet.' })));
    }
    var meName = d.me && d.me.username;
    d.rows.forEach(function (r) { rows.appendChild(row(r, r.username === meName)); });
    if (d.me && !d.rows.some(function (r) { return r.username === meName; }) && !state.q) {
      rows.appendChild(h('tr', null, h('td', { colspan: 6, class: 'muted', text: '...' })));
      rows.appendChild(row(d.me, true));
    }
    var shown = state.q ? d.matches : d.total;
    document.getElementById('count').textContent = shown + (shown === 1 ? ' player' : ' players') + ' · page ' + d.page + ' of ' + d.pages;
    document.getElementById('prev').disabled = d.page <= 1;
    document.getElementById('next').disabled = d.page >= d.pages;
  }

  function load() {
    var qs = '?mode=' + state.mode + '&page=' + state.page + '&pageSize=25' + (state.q ? '&q=' + encodeURIComponent(state.q) : '');
    return RC.api('/leaderboard' + qs, { quiet: true }).then(function (r) { if (r.ok) render(r.data); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () {
      state.mode = b.getAttribute('data-mode'); state.page = 1;
      Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      document.getElementById('blurb').textContent = state.mode === 'fastest'
        ? 'Players who cleared every challenge, ranked by total time.' : 'Ranked by score. Ties go to whoever reached it first.';
      load();
    });
  });
  document.getElementById('q').addEventListener('input', RC.debounce(function () {
    state.q = document.getElementById('q').value.trim(); state.page = 1; load();
  }, 250));
  document.getElementById('prev').addEventListener('click', function () { state.page -= 1; load(); });
  document.getElementById('next').addEventListener('click', function () { state.page += 1; load(); });

  setInterval(function () {
    if (!latest) return;
    Array.prototype.forEach.call(rows.querySelectorAll('tr'), function () {});
    var running = latest.rows.concat(latest.me ? [latest.me] : []);
    var cells = rows.querySelectorAll('td.time');
    Array.prototype.forEach.call(cells, function (cell) {
      var r = running.filter(function (x) { return x.username === cell.getAttribute('data-id'); })[0];
      if (r && r.running) cell.textContent = timeText(r);
    });
  }, 1000);

  RC.boot().then(function () { load(); RC.live(load, document.getElementById('live')); });
})();
