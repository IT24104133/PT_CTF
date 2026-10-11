(function () {
  'use strict';

  var CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var root = document.documentElement;
  var form = document.getElementById('answers');
  var verifyBtn = document.getElementById('verify');
  var status = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var vault = document.getElementById('vault');
  var submitPanel = document.getElementById('submit-panel');
  var lockTimer = null;
  var solved = false;

  function startReveal() {
    var items = document.querySelectorAll('.rv');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  var splash = document.getElementById('splash');
  if (root.classList.contains('intro') && splash) {
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (reduced) {
      root.classList.remove('intro', 'splash');
      startReveal();
    } else {
      var acts = Array.prototype.slice.call(splash.querySelectorAll('.act'));
      var dots = Array.prototype.slice.call(splash.querySelectorAll('.sp-dots i'));
      var timers = [];
      var ended = false;
      var later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };
      var plan = [{ show: 200, hide: 3200 }, { show: 3600, hide: null }];
      var END = 9600;
      var endIntro = function () {
        if (ended) return;
        ended = true;
        timers.forEach(clearTimeout);
        document.removeEventListener('keydown', onKey);
        splash.classList.add('leave');
        setTimeout(function () {
          root.classList.remove('intro', 'splash');
          document.body.classList.add('after-intro');
          startReveal();
        }, 900);
      };
      var onKey = function (e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); endIntro(); } };
      document.addEventListener('keydown', onKey);
      document.getElementById('sp-skip').addEventListener('click', endIntro);
      acts.forEach(function (act, i) {
        later(function () { act.classList.add('on'); SolsticeSound.play('reveal'); dots.forEach(function (d, j) { d.classList.toggle('on', j === i); }); }, plan[i].show);
        if (plan[i].hide) {
          later(function () { act.classList.add('out'); }, plan[i].hide);
          later(function () { act.classList.remove('on', 'out'); }, plan[i].hide + 700);
        }
      });
      later(endIntro, END);
    }
  } else {
    startReveal();
  }

  function say(text, kind) {
    statusText.textContent = text;
    status.className = 'hint' + (kind ? ' ' + kind : '');
  }
  function fieldBox(name) { return document.querySelector('.field[data-f="' + name + '"]'); }
  function setObj(name, ok) {
    var o = document.querySelector('#obj li[data-o="' + name + '"]');
    if (o) o.classList.toggle('live', ok);
  }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }
  function shake() { form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); SolsticeSound.play('deny'); }
  function typeInto(el, text) {
    el.textContent = '';
    if (reduced) { el.textContent = text; return; }
    var i = 0;
    (function step() { el.textContent = text.slice(0, ++i); SolsticeSound.play('type'); if (i < text.length) setTimeout(step, 28); })();
  }

  function showVault(flag, animate) {
    SolsticeSound.play('success');
    solved = true;
    vault.hidden = false;
    void vault.offsetWidth;
    vault.classList.add('open');
    document.getElementById('t-s5').className = 'done';
    setObj('attackerIp', true);
    setObj('uaFlag', true);
    if (flag) {
      document.getElementById('flagbox').hidden = false;
      var flagEl = document.getElementById('flag');
      if (animate) setTimeout(function () { typeInto(flagEl, flag); }, 700);
      else flagEl.textContent = flag;
    }
    if (animate) setTimeout(function () { vault.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }, 250);
    say('Both findings verified. Stage 5 complete.', 'success');
  }

  function lockFor(seconds) {
    clearInterval(lockTimer);
    var left = seconds;
    verifyBtn.disabled = true;
    say('Too many submissions. Try again in ' + left + 's.', 'error');
    lockTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) { clearInterval(lockTimer); verifyBtn.disabled = false; say('Both answers must be right to finish Stage 5.'); }
      else say('Too many submissions. Try again in ' + left + 's.', 'error');
    }, 1000);
  }

  // ---------- log viewer ----------
  var logView = document.getElementById('log-view');
  var tabAccess = document.getElementById('tab-access');
  var tabError = document.getElementById('tab-error');
  var findInput = document.getElementById('log-find');
  var logs = { access: '(loading...)', error: '(loading...)' };
  var activeLog = 'access';

  function renderLog() {
    var text = logs[activeLog] || '';
    var needle = findInput.value.trim();
    var html = esc(text).replace(/RP\{[^}<\s]*\}/g, function (m) { return '<mark>' + m + '</mark>'; });
    if (needle) {
      try {
        var re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        html = html.replace(re, function (m) { return '<mark>' + m + '</mark>'; });
      } catch (e) { /* ignore bad pattern */ }
    }
    logView.innerHTML = html;
  }

  function loadLogs() {
    Promise.all([
      fetch('/evidence/access.log', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : '(not ready yet)'; }),
      fetch('/evidence/error.log', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : '(not ready yet)'; }),
    ]).then(function (res) {
      logs.access = res[0];
      logs.error = res[1];
      renderLog();
    }).catch(function () {
      logView.textContent = 'Could not load the logs.';
    });
  }
  loadLogs();

  tabAccess.addEventListener('click', function () { activeLog = 'access'; tabAccess.classList.add('on'); tabError.classList.remove('on'); renderLog(); });
  tabError.addEventListener('click', function () { activeLog = 'error'; tabError.classList.add('on'); tabAccess.classList.remove('on'); renderLog(); });
  findInput.addEventListener('input', renderLog);

  // ---------- resume progress ----------
  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) { if (r.status === 401) { window.location.replace('/'); return null; } return r.json(); })
    .then(function (d) {
      if (!d) return;
      if (!d.solved4) { window.location.replace('/exhibit-d.html'); return; }
      if (!d.dhalf) { window.location.replace('/exhibit-dhalf.html'); return; }
      if (!d.stage5) { window.location.replace('/gate-5.html'); return; }
      if (d.exhibitEReady === false) {
        submitPanel.classList.add('notready');
        verifyBtn.disabled = true;
      }
      if (d.solved5) {
        fieldBox('attackerIp').classList.add('ok');
        fieldBox('uaFlag').classList.add('ok');
        showVault(d.flag5 || '', false);
      }
    })
    .catch(function () {});

  // ---------- submit ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ip = form.elements.attackerIp.value;
    var uaFlag = form.elements.uaFlag.value;
    if (!ip.trim() || !uaFlag.trim()) {
      say('Fill in both answers first.', 'error');
      shake();
      return;
    }

    verifyBtn.disabled = true;
    say('Checking your findings...');

    fetch('/api/exhibit-e', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ attackerIp: ip, uaFlag: uaFlag })
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data, res: res }; }); })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 403) { window.location.replace('/gate-5.html'); return; }
        if (r.status === 429) { lockFor(parseInt(r.res.headers.get('Retry-After'), 10) || 60); return; }
        verifyBtn.disabled = false;
        if (r.status === 503) { submitPanel.classList.add('notready'); verifyBtn.disabled = true; say(r.data.error || 'This stage is not ready yet.', 'error'); return; }
        if (r.status !== 200 || !r.data.ok) { say(r.data.error || 'Something went wrong. Try again.', 'error'); return; }

        var results = r.data.results || {};
        ['attackerIp', 'uaFlag'].forEach(function (n) {
          var box = fieldBox(n);
          box.classList.remove('ok', 'bad');
          box.classList.add(results[n] ? 'ok' : 'bad');
          box.querySelector('.res-mark').innerHTML = results[n] ? CHECK : CROSS;
        });

        if (r.data.solved) {
          showVault(r.data.flag || '', true);
        } else {
          say('Not quite. Fix the marked answers and verify again.', 'error');
          shake();
        }
      })
      .catch(function () { verifyBtn.disabled = false; say('Cannot reach the server. Is it running?', 'error'); });
  });

  ['attackerIp', 'uaFlag'].forEach(function (n) {
    form.elements[n].addEventListener('input', function () {
      if (solved) return;
      var box = fieldBox(n);
      box.classList.remove('ok', 'bad');
      box.querySelector('.res-mark').innerHTML = '';
    });
  });

  document.getElementById('copy').addEventListener('click', function () {
    var btn = this;
    var text = document.getElementById('flag').textContent;
    function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  });

  document.getElementById('logout').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).then(function () {}, function () {}).then(function () { window.location.replace('/'); });
  });
})();
