(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

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
      var plan = [{ show: 200, hide: 3300 }, { show: 3700, hide: null }];
      var END = 10200;
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

  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) { if (r.status === 401) { window.location.replace('/'); return null; } return r.json(); })
    .then(function (d) {
      if (!d) return;
      if (!d.solved4) { window.location.replace('/exhibit-d.html'); return; }
    })
    .catch(function () {});

  var btn = document.getElementById('continue-btn');
  var err = document.getElementById('continue-err');
  btn.addEventListener('click', function () {
    btn.disabled = true;
    err.hidden = true;
    fetch('/api/ack-dhalf', { method: 'POST', credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); throw new Error('signed out'); }
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok) throw new Error('failed');
        window.location.href = (d.redirect || '/gate-5.html');
      })
      .catch(function (e) {
        if (e && e.message === 'signed out') return;
        btn.disabled = false;
        err.textContent = 'Could not continue. Check the server and try again.';
        err.hidden = false;
      });
  });

  document.getElementById('logout').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).then(function () {}, function () {}).then(function () { window.location.replace('/'); });
  });
})();
