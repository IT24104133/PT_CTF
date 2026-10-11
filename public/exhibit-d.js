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
  var myOwnId = null;

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
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
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
    document.getElementById('t-s4').className = 'done';
    setObj('passphrase', true);
    setObj('debt', true);
    if (flag) {
      document.getElementById('flagbox').hidden = false;
      var flagEl = document.getElementById('flag');
      if (animate) setTimeout(function () { typeInto(flagEl, flag); }, 700);
      else flagEl.textContent = flag;
    }
    if (animate) setTimeout(function () { vault.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }, 250);
    say('Both findings verified. Stage 4 complete.', 'success');
  }

  function lockFor(seconds) {
    clearInterval(lockTimer);
    var left = seconds;
    verifyBtn.disabled = true;
    say('Too many submissions. Try again in ' + left + 's.', 'error');
    lockTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) { clearInterval(lockTimer); verifyBtn.disabled = false; say('Both answers must be right to finish Stage 4.'); }
      else say('Too many submissions. Try again in ' + left + 's.', 'error');
    }, 1000);
  }

  var xxeLeaked = false;

  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) { if (r.status === 401) { window.location.replace('/'); return null; } return r.json(); })
    .then(function (d) {
      if (!d) return;
      if (!d.solved3) { window.location.replace('/exhibit-c.html'); return; }
      if (!d.stage4) { window.location.replace('/gate-4.html'); return; }
      if (d.solved4) {
        fieldBox('passphrase').classList.add('ok');
        fieldBox('debt').classList.add('ok');
        showVault(d.flag4 || '', false);
      }
    })
    .catch(function () {});

  // ---------- HR Portal: bulk import (XXE) now lives on the real, separate site ----------
  var xxeTag = document.getElementById('xxe-status-tag');

  function refreshXxeStatus() {
    fetch('/api/lab/d-status', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || !d.leaked) return;
        xxeLeaked = true;
        xxeTag.textContent = 'CONFIG LEAKED';
        xxeTag.classList.add('ok-tag');
      })
      .catch(function () {});
  }
  refreshXxeStatus();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshXxeStatus(); });

  // ---------- Lab 2: IDOR payslip viewer ----------
  var idorOut = document.getElementById('idor-out');
  var idorTag = document.getElementById('idor-status-tag');
  var idorId = document.getElementById('idor-id');

  function renderPayslip(record, mine) {
    if (!record) { idorOut.innerHTML = '<div class="idor-card"><span class="bad">No payslip found for that id.</span></div>'; return; }
    idorOut.innerHTML =
      '<div class="idor-card ' + (mine ? 'mine' : 'other') + '">' +
      '<div><span class="k">id</span> ' + esc(record.id) + '</div>' +
      '<div><span class="k">name</span> ' + esc(record.name) + '</div>' +
      '<div><span class="k">role</span> ' + esc(record.role) + '</div>' +
      '<div><span class="k">years</span> ' + esc(record.years) + '</div>' +
      '<div><span class="k">balance</span> <span class="debt">' + esc(record.debt) + '</span></div>' +
      '</div>';
    if (!mine) { idorTag.textContent = 'VIEWING SOMEONE ELSE'; idorTag.classList.add('ok-tag'); }
  }

  function loadPayslip(id) {
    fetch('/api/lab/payslip?id=' + encodeURIComponent(id), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { idorOut.innerHTML = '<div class="idor-card"><span class="bad">' + esc(d.error || 'No record.') + '</span></div>'; return; }
        var mine = myOwnId !== null && String(d.record.id) === String(myOwnId);
        if (myOwnId === null) { myOwnId = d.record.id; mine = true; }
        renderPayslip(d.record, mine);
      })
      .catch(function () { idorOut.innerHTML = '<div class="idor-card"><span class="bad">Cannot reach the server.</span></div>'; });
  }

  // On arrival, learn this session's own payslip id and show that payslip first.
  fetch('/api/lab/my-payslip-id', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok) return;
      myOwnId = d.id;
      idorId.value = String(d.id);
      loadPayslip(d.id);
    })
    .catch(function () {});

  document.getElementById('idor-go').addEventListener('click', function () {
    var id = idorId.value.trim();
    if (!id) return;
    loadPayslip(id);
  });
  idorId.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('idor-go').click(); }
  });

  // ---------- submit ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var passphrase = form.elements.passphrase.value;
    var debt = form.elements.debt.value;
    if (!passphrase.trim() || !debt.trim()) {
      say('Fill in both answers first.', 'error');
      shake();
      return;
    }

    verifyBtn.disabled = true;
    say('Checking your findings...');

    fetch('/api/exhibit-d', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ passphrase: passphrase, debt: debt })
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data, res: res }; }); })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 403) { window.location.replace('/gate-4.html'); return; }
        if (r.status === 429) { lockFor(parseInt(r.res.headers.get('Retry-After'), 10) || 60); return; }
        verifyBtn.disabled = false;
        if (r.status !== 200 || !r.data.ok) { say(r.data.error || 'Something went wrong. Try again.', 'error'); return; }

        var results = r.data.results || {};
        ['passphrase', 'debt'].forEach(function (n) {
          var box = fieldBox(n);
          box.classList.remove('ok', 'bad');
          box.classList.add(results[n] ? 'ok' : 'bad');
          box.querySelector('.res-mark').innerHTML = results[n] ? CHECK : CROSS;
        });

        if (r.data.solved) {
          showVault(r.data.flag || '', true);
        } else {
          var msg = !xxeLeaked && !results.passphrase
            ? 'The passphrase has to come from the leaked config — run the XXE import above first.'
            : 'One or both answers are not right yet. Fix the marked field and verify again.';
          say(msg, 'error');
          shake();
        }
      })
      .catch(function () { verifyBtn.disabled = false; say('Cannot reach the server. Is it running?', 'error'); });
  });

  ['passphrase', 'debt'].forEach(function (n) {
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
