(function () {
  'use strict';

  var FIELDS = ['city', 'street', 'cafe', 'phone', 'video'];
  var CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var form = document.getElementById('answers');
  var verifyBtn = document.getElementById('verify');
  var status = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var vault = document.getElementById('vault');
  var flagEl = document.getElementById('flag');
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

  // ---------- Stage 1 title scene ----------
  // Played once after "Accept the case". The address is cleaned up so a reload does not replay it.
  var root = document.documentElement;
  var intro = document.getElementById('intro');

  if (root.classList.contains('intro')) {
    try { history.replaceState(null, '', location.pathname); } catch (e) {}

    if (reduced) {
      root.classList.remove('intro');
      startReveal();
    } else {
      var ended = false;
      var endIntro = function () {
        if (ended) return;
        ended = true;
        document.removeEventListener('keydown', onKey);
        intro.classList.add('leave');                 // fade the scene out
        setTimeout(function () {
          root.classList.remove('intro');             // page slides in
          document.body.classList.add('after-intro');
          startReveal();
        }, 800);
      };
      var onKey = function (e) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') endIntro();
      };
      document.addEventListener('keydown', onKey);
      document.getElementById('intro-skip').addEventListener('click', endIntro);

      intro.classList.add('play');                    // start the animations
      SolsticeSound.play('reveal');
      setTimeout(endIntro, 5600);
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
    var m = box.querySelector('.res-mark');
    box.classList.remove('ok', 'bad');
    box.classList.add(ok ? 'ok' : 'bad');
    m.innerHTML = ok ? CHECK : CROSS;
    var o = document.querySelector('#obj li[data-o="' + name + '"]');
    if (o) o.classList.toggle('live', ok);
  }

  function shake() {
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    SolsticeSound.play('deny');
  }

  // Types the flag out one character at a time.
  function typeFlag(text) {
    flagEl.textContent = '';
    if (reduced) { flagEl.textContent = text; return; }
    var i = 0;
    (function step() {
      flagEl.textContent = text.slice(0, ++i);
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

    var s2 = document.getElementById('t-s2');
    s2.className = 'unlocked';
    document.getElementById('t-s2-text').textContent = 'Unlocked';
    var ex = document.getElementById('t-ex');
    ex.className = 'done';

    FIELDS.forEach(function (n) {
      var o = document.querySelector('#obj li[data-o="' + n + '"]');
      if (o) o.classList.add('live');
    });

    if (animate) {
      setTimeout(function () { typeFlag(flag); }, 700);
      setTimeout(function () { vault.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }, 250);
    } else {
      flagEl.textContent = flag;
    }
    say('All findings verified. Stage 2 is open.', 'success');
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
        say('Every answer must be right to open Stage 2.');
      } else {
        say('Too many submissions. Try again in ' + left + 's.', 'error');
      }
    }, 1000);
  }

  // ---------- resume progress (reload, coming back later) ----------
  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 401) { window.location.replace('/'); return null; }
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      if (!d.accepted) { window.location.replace('/stage2.html'); return; }
      if (d.solved && d.flag) {
        FIELDS.forEach(function (n) { fieldBox(n).classList.add('ok'); });
        showVault(d.flag, false);
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

    fetch('/api/exhibit-a', {
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
        if (r.status === 403) { window.location.replace('/stage2.html'); return; }
        if (r.status === 429) {
          lockFor(parseInt(r.res.headers.get('Retry-After'), 10) || 60);
          return;
        }
        verifyBtn.disabled = false;
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

        if (r.data.solved && r.data.flag) {
          showVault(r.data.flag, true);
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

  // Editing an answer clears its mark.
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

  // ---------- copy flag ----------
  document.getElementById('copy').addEventListener('click', function () {
    var btn = this;
    var text = flagEl.textContent;
    function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var r = document.createRange();
      r.selectNodeContents(flagEl);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  });

  // ---------- lightbox ----------
  var lb = document.getElementById('lightbox');
  var lbImg = lb.querySelector('img');
  var lbCap = document.getElementById('lb-cap');

  function closeLb() { lb.hidden = true; lbImg.removeAttribute('src'); }
  Array.prototype.forEach.call(document.querySelectorAll('.zoom'), function (b) {
    b.addEventListener('click', function () {
      lbImg.src = b.getAttribute('data-src');
      lbImg.alt = b.querySelector('img').alt;
      lbCap.textContent = b.getAttribute('data-cap');
      lb.hidden = false;
    });
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
