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
  var lockTimer = null;
  var solved = false;

  // ---------- reveal on scroll ----------
  function startReveal() {
    var items = document.querySelectorAll('.rv');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  // ---------- title scene ----------
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
      var onKey = function (e) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); endIntro(); }
      };
      document.addEventListener('keydown', onKey);
      document.getElementById('sp-skip').addEventListener('click', endIntro);

      acts.forEach(function (act, i) {
        later(function () {
          act.classList.add('on'); SolsticeSound.play('reveal');
          dots.forEach(function (d, j) { d.classList.toggle('on', j === i); });
        }, plan[i].show);
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

  // ---------- helpers ----------
  function say(text, kind) {
    statusText.textContent = text;
    status.className = 'hint' + (kind ? ' ' + kind : '');
  }
  function fieldBox(name) { return document.querySelector('.field[data-f="' + name + '"]'); }
  function objLi(name) { return document.querySelector('#obj li[data-o="' + name + '"]'); }

  function setObj(name, ok) {
    var o = objLi(name);
    if (o) o.classList.toggle('live', ok);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function shake() {
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    SolsticeSound.play('deny');
  }

  function typeInto(el, text) {
    el.textContent = '';
    if (reduced) { el.textContent = text; return; }
    var i = 0;
    (function step() {
      el.textContent = text.slice(0, ++i);
      SolsticeSound.play('type');
      if (i < text.length) setTimeout(step, 28);
    })();
  }

  function showVault(flag, animate) {
    SolsticeSound.play('success');
    solved = true;
    vault.hidden = false;
    void vault.offsetWidth;
    vault.classList.add('open');
    document.getElementById('t-s3').className = 'done';
    ['investigation', 'code'].forEach(function (n) { setObj(n, true); });

    if (flag) {
      document.getElementById('flagbox').hidden = false;
      var flagEl = document.getElementById('flag');
      if (animate) setTimeout(function () { typeInto(flagEl, flag); }, 700);
      else flagEl.textContent = flag;
    }
    if (animate) setTimeout(function () { vault.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }, 250);
    say('Investigation verified. Stage 3 complete.', 'success');
  }

  function lockFor(seconds) {
    clearInterval(lockTimer);
    var left = seconds;
    verifyBtn.disabled = true;
    say('Too many submissions. Try again in ' + left + 's.', 'error');
    lockTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(lockTimer);
        verifyBtn.disabled = false;
        say('Your investigation must be complete, and your answer must be correct.');
      } else {
        say('Too many submissions. Try again in ' + left + 's.', 'error');
      }
    }, 1000);
  }

  // ---------- resume progress ----------
  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 401) { window.location.replace('/'); return null; }
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      if (!d.solved2) { window.location.replace('/exhibit-b.html'); return; }
      if (!d.stage3) { window.location.replace('/gate-3.html'); return; }
      if (d.solved3) {
        fieldBox('code').classList.add('ok');
        showVault(d.flag3 || '', false);
      }
      refreshLabStatus();
    })
    .catch(function () {});

  // ---------- PeopleHub: the real investigation now lives on the real, separate platform ----------
  var phTag = document.getElementById('ph-status-tag');
  var portalCode = document.getElementById('portal-code');
  var portalHint = document.getElementById('portal-hint');
  portalHint.innerHTML = '<span>This page checks automatically when you come back to this tab — no need to refresh.</span>';

  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.hrAccessCode) portalCode.textContent = d.hrAccessCode;
    })
    .catch(function () {});

  // The player leaves this tab to work in PeopleHub, then comes back — re-check status whenever
  // they return instead of waiting on a fixed poll.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshLabStatus();
  });

  function refreshLabStatus() {
    fetch('/api/lab/c-status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        if (d.investigation) {
          phTag.textContent = 'INVESTIGATION COMPLETE';
          phTag.classList.add('ok-tag');
          setObj('investigation', true);
        }
      })
      .catch(function () {});
  }

  // ---------- submit ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = form.elements.code.value;
    if (!code.trim()) {
      say('Type the emergency access code you found first.', 'error');
      shake();
      return;
    }

    verifyBtn.disabled = true;
    say('Checking your findings...');

    fetch('/api/exhibit-c', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ code: code })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data, res: res }; });
      })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 403) { window.location.replace('/gate-3.html'); return; }
        if (r.status === 429) { lockFor(parseInt(r.res.headers.get('Retry-After'), 10) || 60); return; }
        verifyBtn.disabled = false;
        if (r.status !== 200 || !r.data.ok) {
          say(r.data.error || 'Something went wrong. Try again.', 'error');
          return;
        }
        var results = r.data.results || {};
        setObj('investigation', !!results.investigation);
        var box = fieldBox('code');
        box.classList.remove('ok', 'bad');
        box.classList.add(results.code ? 'ok' : 'bad');
        box.querySelector('.res-mark').innerHTML = results.code ? CHECK : CROSS;

        if (r.data.solved) {
          showVault(r.data.flag || '', true);
        } else {
          var missing = [];
          if (!results.investigation) missing.push('finish investigating PeopleHub');
          if (!results.code) missing.push('type the correct access code');
          say('Not yet: ' + missing.join(', ') + '.', 'error');
          shake();
        }
      })
      .catch(function () {
        verifyBtn.disabled = false;
        say('Cannot reach the server. Is it running?', 'error');
      });
  });

  form.elements.code.addEventListener('input', function () {
    if (solved) return;
    var box = fieldBox('code');
    box.classList.remove('ok', 'bad');
    box.querySelector('.res-mark').innerHTML = '';
  });

  // ---------- copy the flag ----------
  document.getElementById('copy').addEventListener('click', function () {
    var btn = this;
    var text = document.getElementById('flag').textContent;
    function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  });

  // ---------- logout ----------
  document.getElementById('logout').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function () {}, function () {})
      .then(function () { window.location.replace('/'); });
  });
})();
