(function () {
  'use strict';

  var FIELDS = ['location', 'modified', 'model'];
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
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  // ---------- title scene: welcome to Stage 2, then the stage title ----------
  var splash = document.getElementById('splash');
  if (root.classList.contains('intro') && splash) {
    try { history.replaceState(null, '', location.pathname); } catch (e) {}   // a reload will not replay it

    if (reduced) {
      root.classList.remove('intro', 'splash');
      startReveal();
    } else {
      var acts = Array.prototype.slice.call(splash.querySelectorAll('.act'));
      var dots = Array.prototype.slice.call(splash.querySelectorAll('.sp-dots i'));
      var timers = [];
      var ended = false;
      var later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };
      var plan = [{ show: 200, hide: 3400 }, { show: 3800, hide: null }];
      var END = 10000;

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

  function mark(name, ok) {
    var box = fieldBox(name);
    box.classList.remove('ok', 'bad');
    box.classList.add(ok ? 'ok' : 'bad');
    box.querySelector('.res-mark').innerHTML = ok ? CHECK : CROSS;
    var o = document.querySelector('#obj li[data-o="' + name + '"]');
    if (o) o.classList.toggle('live', ok);
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

    var t = document.getElementById('t-s2');
    t.className = 'done';
    FIELDS.forEach(function (n) {
      var o = document.querySelector('#obj li[data-o="' + n + '"]');
      if (o) o.classList.add('live');
    });

    if (flag) {
      document.getElementById('flagbox').hidden = false;
      var flagEl = document.getElementById('flag');
      if (animate) setTimeout(function () { typeInto(flagEl, flag); }, 700);
      else flagEl.textContent = flag;
    }
    if (animate) {
      setTimeout(function () { vault.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }, 250);
    }
    say('All findings verified. Stage 2 complete.', 'success');
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
        say('All ' + FIELDS.length + ' answers must be right to finish Stage 2.');
      } else {
        say('Too many submissions. Try again in ' + left + 's.', 'error');
      }
    }, 1000);
  }

  // ---------- the evidence photo may not be uploaded yet ----------
  var img = document.getElementById('b-img');
  function photoMissing() {
    var box = document.getElementById('b-evi');
    if (box.classList.contains('missing')) return;
    box.classList.add('missing');
    var m = document.createElement('div');
    m.className = 'b-missing';
    m.textContent = 'The evidence photo is still being prepared. Check back soon.';
    box.insertBefore(m, box.firstChild);
    document.getElementById('b-note').hidden = true;
  }
  img.addEventListener('error', photoMissing);

  // ---------- resume progress ----------
  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 401) { window.location.replace('/'); return null; }
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      if (!d.accepted) { window.location.replace('/stage2.html'); return; }
      if (!d.stage2) { window.location.replace('/gate-2.html'); return; }
      if (d.exhibitBReady === false) {
        submitPanel.classList.add('notready');
        verifyBtn.disabled = true;
        photoMissing();
      }
      if (d.solved2) {
        FIELDS.forEach(function (n) { fieldBox(n).classList.add('ok'); });
        showVault(d.flag2 || '', false);
      }
    })
    .catch(function () {});

  // ---------- submit ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var payload = {};
    var empty = 0;
    FIELDS.forEach(function (n) {
      payload[n] = form.elements[n].value;
      if (!payload[n].trim()) empty += 1;
    });
    if (empty) {
      say('Fill in all ' + FIELDS.length + ' answers first.', 'error');
      shake();
      return;
    }

    verifyBtn.disabled = true;
    say('Checking your findings...');

    fetch('/api/exhibit-b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data, res: res };
        });
      })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 403) { window.location.replace('/gate-2.html'); return; }
        if (r.status === 429) { lockFor(parseInt(r.res.headers.get('Retry-After'), 10) || 60); return; }
        verifyBtn.disabled = false;
        if (r.status === 503) {
          submitPanel.classList.add('notready');
          verifyBtn.disabled = true;
          say(r.data.error || 'This stage is not ready yet.', 'error');
          return;
        }
        if (r.status !== 200 || !r.data.ok) {
          say(r.data.error || 'Something went wrong. Try again.', 'error');
          return;
        }

        var results = r.data.results || {};
        var good = 0;
        FIELDS.forEach(function (n) {
          mark(n, !!results[n]);
          if (results[n]) good += 1;
        });

        if (r.data.solved) {
          showVault(r.data.flag || '', true);
        } else {
          say(good + ' of ' + FIELDS.length + ' correct. Fix the marked answers and verify again.', 'error');
          shake();
        }
      })
      .catch(function () {
        verifyBtn.disabled = false;
        say('Cannot reach the server. Is it running?', 'error');
      });
  });

  FIELDS.forEach(function (n) {
    form.elements[n].addEventListener('input', function () {
      if (solved) return;
      var box = fieldBox(n);
      box.classList.remove('ok', 'bad');
      box.querySelector('.res-mark').innerHTML = '';
      var o = document.querySelector('#obj li[data-o="' + n + '"]');
      if (o) o.classList.remove('live');
    });
  });

  // ---------- copy the flag ----------
  document.getElementById('copy').addEventListener('click', function () {
    var btn = this;
    var text = document.getElementById('flag').textContent;
    function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  });

  // ---------- lightbox ----------
  var lb = document.getElementById('lightbox');
  var lbImg = lb.querySelector('img');
  function closeLb() { lb.hidden = true; lbImg.removeAttribute('src'); }
  document.getElementById('b-zoom').addEventListener('click', function () {
    lbImg.src = this.getAttribute('data-src');
    lbImg.alt = img.alt;
    document.getElementById('lb-cap').textContent = this.getAttribute('data-cap');
    lb.hidden = false;
  });
  lb.addEventListener('click', closeLb);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) closeLb(); });

  // ---------- logout ----------
  document.getElementById('logout').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function () {}, function () {})
      .then(function () { window.location.replace('/'); });
  });
})();
