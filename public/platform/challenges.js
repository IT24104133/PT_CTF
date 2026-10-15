(function () {
  'use strict';
  var h = RC.h;
  var list = document.getElementById('list');
  var playBtn = document.getElementById('play');
  var playMsg = document.getElementById('play-msg');

  function card(c) {
    var chip = c.status === 'solved' ? h('span', { class: 'badge ok', text: 'Solved' })
      : c.status === 'current' ? h('span', { class: 'badge cyan', text: 'Unlocked' }) : h('span', { class: 'badge', text: 'Locked' });
    var meta = c.status === 'solved'
      ? 'Solved ' + RC.dateTime(c.completedAt) + (c.solveMs ? ' · ' + RC.duration(c.solveMs) + ' on this step' : '')
      : c.status === 'current' ? 'Next up' : 'Solve the previous stage to unlock';
    return h('article', { class: 'panel challenge ' + c.status },
      h('div', { class: 'top' }, h('span', { class: 'stage', text: c.stage === 0 ? 'ENTRY' : 'STAGE ' + c.stage }), chip),
      h('h3', { text: c.name }),
      h('p', { class: 'muted', text: c.status === 'locked' ? 'Details revealed when unlocked.' : c.summary }),
      h('div', { class: 'top' }, h('span', { class: 'pts', text: c.points + ' pts' })),
      h('p', { class: 'meta', text: meta }));
  }

  function load() {
    RC.api('/dashboard').then(function (r) {
      if (!r.ok) return;
      RC.clear(list);
      r.data.challenges.forEach(function (c) { list.appendChild(card(c)); });
      playBtn.disabled = r.data.user.status !== 'active';
      playBtn.textContent = r.data.status === 'completed' ? 'Replay' : r.data.status === 'in_progress' ? 'Continue' : 'Start CTF';
    });
  }

  playBtn.addEventListener('click', function () {
    playBtn.disabled = true;
    RC.api('/play', { body: {} }).then(function (r) {
      if (r.ok && r.data.redirect) { window.location.href = r.data.redirect; return; }
      playBtn.disabled = false;
      playMsg.textContent = r.data.error || 'Could not start.';
    });
  });

  RC.boot({ require: true }).then(function (me) {
    if (me.user.role === 'admin') { window.location.replace('/admin'); return; }
    load();
    RC.live(load);
  });
})();
