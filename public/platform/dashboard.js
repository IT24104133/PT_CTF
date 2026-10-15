(function () {
  'use strict';
  var h = RC.h;
  var data = null;
  var tiles = document.getElementById('tiles');
  var playBtn = document.getElementById('play');
  var playMsg = document.getElementById('play-msg');

  function tile(label, value, sub, id) {
    return h('div', { class: 'panel tile' }, h('span', { class: 'label', text: label }),
      h('span', { class: 'value', id: id || null, text: value }), h('span', { class: 'sub', text: sub || '' }));
  }

  function render(d) {
    data = d;
    d.localAt = Date.now();
    RC.syncClock(d.serverTime);
    document.getElementById('greeting').textContent = 'Welcome, ' + d.user.username;
    document.getElementById('subline').textContent = d.status === 'completed'
      ? 'Every challenge cleared. Your time is locked in on the leaderboard.'
      : d.status === 'in_progress' ? 'Your run is live. Pick up where you left off.' : 'Press start to open the case. Your clock begins on your first click.';

    var banner = document.getElementById('banner');
    RC.clear(banner);
    if (d.disqualified) banner.appendChild(h('div', { class: 'banner', role: 'alert', text: 'This account has been disqualified by an organiser and no longer appears on the leaderboard.' }));
    else if (d.user.status === 'suspended') banner.appendChild(h('div', { class: 'banner warn', role: 'alert', text: 'This account is suspended. You can view your progress but cannot play.' }));

    RC.clear(tiles);
    tiles.appendChild(tile('Score', d.score + ' / ' + d.maxScore, d.latest ? 'Last: ' + d.latest.name + ' (+' + d.latest.points + ')' : 'No points yet'));
    tiles.appendChild(tile('Rank', d.rank ? '#' + d.rank : '--', d.rank ? 'of ' + d.participants + ' players' : 'Not ranked'));
    tiles.appendChild(tile('Solved', d.solved + ' / ' + d.total, d.remaining + ' remaining'));
    tiles.appendChild(tile('Time', RC.duration(d.elapsedMs), d.running ? 'Running' : d.status === 'completed' ? 'Final time' : 'Not started', 'elapsed'));

    var bar = document.getElementById('progress');
    bar.setAttribute('aria-valuenow', d.percent);
    bar.firstChild.style.width = d.percent + '%';
    document.getElementById('progress-text').textContent = d.percent + '% complete';

    var canPlay = d.user.status === 'active';
    playBtn.disabled = !canPlay;
    playBtn.textContent = d.status === 'completed' ? 'Replay challenges' : d.status === 'in_progress' ? 'Continue' : 'Start CTF';

    var cur = document.getElementById('current');
    RC.clear(cur);
    if (d.current) {
      cur.appendChild(h('div', { class: 'challenge' },
        h('div', { class: 'top' }, h('span', { class: 'stage', text: d.current.stage === 0 ? 'ENTRY' : 'STAGE ' + d.current.stage }), h('span', { class: 'pts', text: d.current.points + ' pts' })),
        h('h3', { text: d.current.name }), h('p', { class: 'muted', text: d.current.summary })));
    } else {
      cur.appendChild(h('p', { class: 'muted', text: 'Nothing left to solve. Well done.' }));
    }

    var list = document.getElementById('activity');
    RC.clear(list);
    if (!d.recent.length) list.appendChild(h('li', { class: 'muted', text: 'No activity yet.' }));
    d.recent.forEach(function (e) { list.appendChild(h('li', null, h('span', { text: e.label }), h('time', { text: RC.ago(e.at) }))); });
  }

  function load() {
    return RC.api('/dashboard').then(function (r) { if (r.ok) render(r.data); });
  }

  playBtn.addEventListener('click', function () {
    playBtn.disabled = true; playMsg.textContent = '';
    RC.api('/play', { body: {} }).then(function (r) {
      if (r.ok && r.data.redirect) { window.location.href = r.data.redirect; return; }
      playBtn.disabled = false;
      playMsg.textContent = r.data.error || 'Could not start. Try again.';
    });
  });

  setInterval(function () {
    var el = document.getElementById('elapsed');
    if (el && data && data.running) el.textContent = RC.duration(data.elapsedMs + (Date.now() - data.localAt));
  }, 1000);

  RC.boot({ require: true }).then(function (me) {
    if (me.user.role === 'admin') { window.location.replace('/admin'); return; }
    load();
    RC.live(load, document.getElementById('live'));
  });
})();
