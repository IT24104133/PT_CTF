(function () {
  'use strict';

  var STAGES = [
    { n: 1, name: 'Where in the world', exhibit: '/exhibit-a.html', gate: '/stage2.html',
      location: 'Seoul, South Korea', hint: 'Follow the café’s homepage link to a video.' },
    { n: 2, name: "The devil's in the EXIF", exhibit: '/exhibit-b.html', gate: '/gate-2.html',
      location: 'Gangnam Station', hint: 'Read the photo’s metadata, not just the picture.' },
    { n: 3, name: 'Cracked login', exhibit: '/exhibit-c.html', gate: '/gate-3.html',
      location: 'HR Portal · Login', hint: 'The login and search boxes trust their input.' },
    { n: 4, name: 'Trusted input', exhibit: '/exhibit-d.html', gate: '/gate-4.html',
      location: 'Payroll System', hint: 'One form parses XML. One page trusts an id.' },
    { n: 5, name: 'Reading the logs', exhibit: '/exhibit-e.html', gate: '/gate-5.html',
      location: 'HR Portal · Server Logs', hint: 'One User-Agent string isn’t like the others.' },
    { n: 6, name: 'Cached evidence', exhibit: '/exhibit-f.html', gate: '/gate-6.html',
      location: 'Recovered Laptop', hint: 'Deleted files can still live in the cache.' },
  ];
  // Where each pin sits on the trail. This is an abstract route, not a real map.
  var PIN_XY = [[70, 230], [175, 120], [285, 195], [390, 85], [490, 175], [585, 235]];

  var ICON_LOCKED_PATH = 'M6 11V8a6 6 0 0 1 12 0v3M4 11h16v10H4z';
  var ICON_OPEN_PATH = 'M6 11V8a6 6 0 0 1 10.5-3.9M4 11h16v10H4z';
  var ICON_DONE_CHECK = 'M9 15.5l2 2 4-4.5';
  var ICON_LOCKED = '<svg viewBox="0 0 24 24"><path d="M6 11V8a6 6 0 0 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg>';
  var ICON_OPEN = '<svg viewBox="0 0 24 24"><path d="M6 11V8a6 6 0 0 1 10.5-3.9"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg>';
  var ICON_DONE = '<svg viewBox="0 0 24 24"><path d="M6 11V8a6 6 0 0 1 10.5-3.9"/><rect x="4" y="11" width="16" height="10" rx="2"/><path d="' + ICON_DONE_CHECK + '"/></svg>';

  var trailScale = 1;

  function stateFor(i, d) {
    var solved = [d.solved, d.solved2, d.solved3, d.solved4, d.solved5, d.solved6];
    var opened = [d.accepted, d.stage2, d.stage3, d.stage4, d.stage5, d.stage6];
    var isDone = !!solved[i];
    var isOpen = !!opened[i];
    var prevDone = i === 0 ? true : !!solved[i - 1];
    return { isDone: isDone, isOpen: isOpen, prevDone: prevDone, state: isDone ? 'done' : isOpen ? 'active' : 'locked' };
  }

  function hrefFor(st, s) {
    if (st.isOpen) return s.exhibit;
    if (st.prevDone) return s.gate;
    return null;
  }

  // ---------------- the six lock cards ----------------
  function buildLocks(d) {
    var row = document.getElementById('lockrow');
    row.innerHTML = '';
    STAGES.forEach(function (s, i) {
      var st = stateFor(i, d);
      var tag = st.isDone ? 'Solved' : st.isOpen ? 'In progress' : st.prevDone ? 'Ready to open' : 'Locked';
      var icon = st.isDone ? ICON_DONE : st.isOpen ? ICON_OPEN : ICON_LOCKED;
      var href = hrefFor(st, s);

      var el = document.createElement(href ? 'a' : 'div');
      el.className = 'lock-card state-' + st.state;
      if (href) el.href = href;
      el.innerHTML =
        '<div class="lock-icon">' + icon + '</div>' +
        '<div class="lock-num">STAGE ' + s.n + '</div>' +
        '<div class="lock-name">' + s.name + '</div>' +
        '<div class="lock-tag">' + tag + '</div>';
      row.appendChild(el);
    });
  }

  // ---------------- the case trail (route + pins) ----------------
  function buildTrail(d) {
    var tagEl = document.getElementById('trail-tag');
    var canvas = document.getElementById('trail-canvas');

    var furthest = 0;
    STAGES.forEach(function (s, i) { var st = stateFor(i, d); if (st.isOpen || st.isDone) furthest = i; });
    tagEl.textContent = 'STAGE ' + (furthest + 1) + ' OF 6';

    var pathD = PIN_XY.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]; }).join(' ');
    var pins = STAGES.map(function (s, i) {
      var st = stateFor(i, d);
      var href = hrefFor(st, s);
      var xy = PIN_XY[i];
      var glyph = st.isDone
        ? '<path class="pin-icon" transform="translate(' + (xy[0] - 7) + ' ' + (xy[1] - 6) + ') scale(0.6)" d="' + ICON_DONE_CHECK + '"/>'
        : '<path class="pin-icon" transform="translate(' + (xy[0] - 9) + ' ' + (xy[1] - 9) + ') scale(0.62)" d="' +
          (st.isOpen ? ICON_OPEN_PATH : ICON_LOCKED_PATH) + '"/>';
      return (
        '<g class="trail-pin state-' + st.state + '" data-i="' + i + '" data-clickable="' + (href ? '1' : '0') + '"' + (href ? ' data-href="' + href + '"' : '') + '>' +
        (st.state === 'active' ? '<circle class="ring pulse" cx="' + xy[0] + '" cy="' + xy[1] + '" r="17"/>' : '') +
        '<circle class="ring" cx="' + xy[0] + '" cy="' + xy[1] + '" r="15"/>' +
        '<circle class="core" cx="' + xy[0] + '" cy="' + xy[1] + '" r="13"/>' +
        glyph +
        '<text class="pin-label" x="' + xy[0] + '" y="' + (xy[1] + 30) + '" text-anchor="middle">STAGE ' + s.n + '</text>' +
        '</g>'
      );
    }).join('');

    canvas.innerHTML =
      '<svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMid meet">' +
      '<path class="trail-route" d="' + pathD + '"/>' +
      pins +
      '</svg>';

    Array.prototype.forEach.call(canvas.querySelectorAll('.trail-pin'), function (g) {
      var href = g.getAttribute('data-href');
      var i = parseInt(g.getAttribute('data-i'), 10);
      if (href) g.addEventListener('click', function () { window.location.href = href; });
      g.addEventListener('mouseenter', function () { showCoords(i); });
    });

    showCoords(furthest);
  }

  function showCoords(i) {
    var s = STAGES[i];
    document.getElementById('trail-coords').textContent = 'SECTOR ' + String(i + 1).padStart(2, '0') + ' · ' + s.location.toUpperCase();
  }

  function applyZoom() { document.getElementById('trail-canvas').style.transform = 'scale(' + trailScale + ')'; }
  document.getElementById('zoom-in').addEventListener('click', function () { trailScale = Math.min(1.6, trailScale + 0.15); applyZoom(); });
  document.getElementById('zoom-out').addEventListener('click', function () { trailScale = Math.max(0.8, trailScale - 0.15); applyZoom(); });
  document.getElementById('zoom-reset').addEventListener('click', function () { trailScale = 1; applyZoom(); });

  // ---------------- current stage ----------------
  function buildCurrentStage(d) {
    var box = document.getElementById('current-stage');
    var furthestOpenIdx = -1, allDone = true;
    STAGES.forEach(function (s, i) {
      var st = stateFor(i, d);
      if (st.isOpen || st.isDone) furthestOpenIdx = i;
      if (!st.isDone) allDone = false;
    });

    if (furthestOpenIdx === -1) {
      box.className = 'current-stage';
      box.innerHTML =
        '<div class="cs-top"><div class="cs-icon">' + ICON_LOCKED + '</div><div><div class="cs-num">NOT STARTED</div><div class="cs-name">Stage 1 · Where in the world</div></div></div>' +
        '<p class="cs-desc">Accept the case on the prologue page to begin.</p>' +
        '<a class="login-btn" href="/stage2.html"><span class="label">Go to the prologue</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
      return;
    }

    var s = STAGES[furthestOpenIdx];
    var st = stateFor(furthestOpenIdx, d);
    var href = hrefFor(st, s);
    box.className = 'current-stage' + (allDone ? ' is-done' : '');
    box.innerHTML =
      '<div class="cs-top"><div class="cs-icon">' + (allDone ? ICON_DONE : ICON_OPEN) + '</div>' +
      '<div><div class="cs-num">' + (allDone ? 'CASE CLOSED' : 'STAGE ' + s.n) + '</div><div class="cs-name">' + s.name + '</div></div></div>' +
      '<p class="cs-desc">' + (allDone ? 'Every stage is solved. Read how it ends.' : s.hint) + '</p>' +
      '<a class="login-btn" href="' + (allDone ? '/epilogue.html' : href) + '"><span class="label">' + (allDone ? 'Read the epilogue' : 'Go to Stage ' + s.n) + '</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
  }

  // ---------------- stepper ----------------
  function buildStepper(d) {
    var el = document.getElementById('stepper');
    var html = '';
    STAGES.forEach(function (s, i) {
      var st = stateFor(i, d);
      var href = hrefFor(st, s);
      var tag = href ? 'a' : 'span';
      html += '<' + tag + (href ? ' href="' + href + '"' : '') + ' class="step-node state-' + st.state + '">' +
        (st.isDone ? '<svg viewBox="0 0 24 24"><path d="' + ICON_DONE_CHECK + '"/></svg>' : s.n) + '</' + tag + '>';
      if (i < STAGES.length - 1) {
        var nextSt = stateFor(i + 1, d);
        html += '<span class="step-link' + ((nextSt.isOpen || nextSt.isDone || st.isDone) ? ' done' : '') + '"></span>';
      }
    });
    el.innerHTML = html;
  }

  // ---------------- stage details (the furthest-reached stage's row set) ----------------
  function buildDetails(d) {
    var idx = 0;
    for (var i = STAGES.length - 1; i >= 0; i--) { var st0 = stateFor(i, d); if (st0.isOpen || st0.isDone) { idx = i; break; } }
    var s = STAGES[idx];
    var st = stateFor(idx, d);
    var statusLabel = st.isDone ? 'Solved' : st.isOpen ? 'Open' : 'Locked';
    var statusCls = st.isDone ? 'done' : st.isOpen ? 'active' : '';
    var rows = [
      ['Stage', s.n + ' / 6'],
      ['Status', '<span class="pill-status ' + statusCls + '">' + statusLabel + '</span>'],
      ['Location', s.location],
      ['Hint', s.hint],
      ['Reward', s.n === 6 ? 'Final Flag' : 'Stage ' + s.n + ' Flag'],
    ];
    document.querySelector('#details-table tbody').innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
    }).join('');
  }

  // ---------------- recent activity ----------------
  // Tracked only in this browser's storage, and only from moments this browser actually
  // observed a stage flip to solved. Never invented, never backdated.
  function relTime(ms) {
    var s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'just now';
    var m = Math.round(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  function buildActivity(d) {
    var log = {};
    try { log = JSON.parse(localStorage.getItem('sx-solve-log') || '{}'); } catch (e) {}
    var now = Date.now();
    var changed = false;
    STAGES.forEach(function (s, i) {
      var st = stateFor(i, d);
      if (st.isDone && !log[s.n]) { log[s.n] = now; changed = true; }
    });
    if (changed) { try { localStorage.setItem('sx-solve-log', JSON.stringify(log)); } catch (e) {} }

    var entries = Object.keys(log).map(function (k) { return { n: parseInt(k, 10), at: log[k] }; }).sort(function (a, b) { return b.at - a.at; });
    var list = document.getElementById('activity-list');
    if (!entries.length) { list.innerHTML = '<li class="side-empty">Nothing yet. Solve a stage to see it here.</li>'; return; }
    list.innerHTML = entries.map(function (e) {
      return '<li><i class="a-dot"></i><span class="a-text">Stage ' + e.n + ' solved</span><span class="a-time">' + relTime(e.at) + '</span></li>';
    }).join('');
  }

  // ---------------- load progress and build everything ----------------
  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 401) { window.location.replace('/'); return null; }
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      buildLocks(d);
      buildTrail(d);
      buildCurrentStage(d);
      buildStepper(d);
      buildDetails(d);
      buildActivity(d);
    })
    .catch(function () {});

  // ---------------- resume with a flag ----------------
  var gate = document.getElementById('gate');
  var form = document.getElementById('unlock');
  var flagEl = document.getElementById('flag');
  var btn = document.getElementById('unlock-btn');
  var status = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var lockTimer = null;
  var busy = false;

  function say(text, kind) {
    statusText.textContent = text;
    status.className = 'hint' + (kind ? ' ' + kind : '');
  }
  function deny() {
    gate.classList.remove('deny');
    void gate.offsetWidth;
    gate.classList.add('deny');
    SolsticeSound.play('deny');
  }
  function lockFor(seconds) {
    clearInterval(lockTimer);
    var left = seconds;
    btn.disabled = true;
    say('Too many tries. Try again in ' + left + 's.', 'error');
    lockTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) { clearInterval(lockTimer); btn.disabled = false; say('Tip: press Ctrl and Enter to resume.'); }
      else say('Too many tries. Try again in ' + left + 's.', 'error');
    }, 1000);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var value = flagEl.value;
    if (!value.trim()) { say('Paste a flag first.', 'error'); deny(); return; }

    busy = true;
    btn.disabled = true;
    say('Checking the flag...');

    fetch('/api/resume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ flag: value })
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data, res: res }; }); })
      .then(function (r) {
        busy = false;
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 429) { lockFor(parseInt(r.res.headers.get('Retry-After'), 10) || 60); return; }
        btn.disabled = false;
        if (r.status === 200 && r.data.ok) {
          gate.classList.remove('deny');
          gate.classList.add('open');
          SolsticeSound.play('unlock');
          say(r.data.lock >= 6 ? 'Flag recognised. The case is closed. Opening the epilogue...' : 'Flag recognised. Lock ' + r.data.lock + ' is open. Jumping ahead...', 'success');
          setTimeout(function () { window.location.href = r.data.redirect; }, 1400);
          return;
        }
        say(r.data.error || 'That flag was not recognised.', 'error');
        deny();
        flagEl.focus();
        flagEl.select();
      })
      .catch(function () { busy = false; btn.disabled = false; say('Cannot reach the server. Is it running?', 'error'); });
  });

  flagEl.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : btn.click(); }
  });
  flagEl.addEventListener('input', function () { gate.classList.remove('deny'); });

  document.getElementById('logout').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).then(function () {}, function () {}).then(function () { window.location.replace('/'); });
  });
})();
