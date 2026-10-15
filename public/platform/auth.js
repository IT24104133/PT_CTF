(function () {
  'use strict';
  var h = RC.h;
  var params = new URLSearchParams(location.search);
  var NEXT_OK = ['/dashboard', '/challenges', '/profile', '/admin', '/leaderboard'];

  var panel = document.getElementById('auth-panel');
  var forms = { login: document.getElementById('login-form'), register: document.getElementById('register-form') };
  var openers = { login: document.getElementById('open-login'), register: document.getElementById('open-register') };
  var registrationOpen = true;

  // ---- decorative clock (time on this screen)
  var started = performance.now();
  var clock = document.getElementById('hud-clock');
  function tick() {
    var ms = performance.now() - started;
    var s = Math.floor(ms / 1000);
    var p = function (n, w) { return String(n).padStart(w, '0'); };
    clock.textContent = p(Math.floor(s / 3600), 2) + ':' + p(Math.floor(s / 60) % 60, 2) + ':' + p(s % 60, 2) + '.' + p(Math.floor(ms % 1000), 3);
    requestAnimationFrame(tick);
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(tick);

  // ---- panel switching
  function show(which, focus) {
    Object.keys(forms).forEach(function (k) {
      forms[k].hidden = k !== which;
      openers[k].setAttribute('aria-expanded', String(k === which));
    });
    panel.hidden = false;
    if (focus !== false) forms[which].querySelector('input').focus();
    history.replaceState(null, '', '/?form=' + which + (params.get('next') ? '&next=' + encodeURIComponent(params.get('next')) : ''));
  }
  Object.keys(openers).forEach(function (k) { openers[k].addEventListener('click', function () { show(k); }); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-switch]'), function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-switch')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.pw-toggle'), function (b) {
    b.addEventListener('click', function () {
      var input = document.getElementById(b.getAttribute('data-target'));
      var reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      b.textContent = reveal ? 'Hide' : 'Show';
      b.setAttribute('aria-pressed', String(reveal));
    });
  });

  // ---- form helpers
  function setErrors(form, errors) {
    Array.prototype.forEach.call(form.querySelectorAll('.err'), function (el) {
      var msg = errors && errors[el.getAttribute('data-for')];
      el.textContent = msg || '';
      var input = form.querySelector('[name="' + el.getAttribute('data-for') + '"]');
      if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    });
  }
  function values(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) out[el.name] = el.value; });
    return out;
  }
  function destination(result) {
    var next = params.get('next');
    if (next && NEXT_OK.indexOf(next) !== -1 && result.redirect !== '/admin') return next;
    return result.redirect || '/dashboard';
  }
  function submit(form, button, msg, path, validate) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = values(form);
      var local = validate ? validate(body) : null;
      setErrors(form, local || {});
      msg.className = 'form-msg'; msg.textContent = '';
      if (local) { msg.className = 'form-msg error'; msg.textContent = 'Please fix the highlighted fields.'; return; }
      button.disabled = true;
      RC.api(path, { body: body, quiet: true }).then(function (r) {
        if (r.ok && r.data.ok) {
          msg.className = 'form-msg ok'; msg.textContent = 'Access granted. Loading ...';
          window.location.href = destination(r.data);
          return;
        }
        button.disabled = false;
        setErrors(form, r.data.errors);
        msg.className = 'form-msg error';
        msg.textContent = r.status === 429
          ? 'Too many attempts. Try again in ' + (r.retryAfter || 60) + ' seconds.'
          : (r.data.error || 'Something went wrong. Try again.');
      }).catch(function () {
        button.disabled = false;
        msg.className = 'form-msg error'; msg.textContent = 'Cannot reach the server.';
      });
    });
  }

  submit(forms.login, document.getElementById('login-submit'), document.getElementById('login-msg'), '/login', function (b) {
    var errors = {};
    if (!b.identifier.trim()) errors.identifier = 'Enter your username or email.';
    if (!b.password) return Object.keys(errors).length ? errors : { identifier: '' };
    return Object.keys(errors).length ? errors : null;
  });
  submit(forms.register, document.getElementById('register-submit'), document.getElementById('register-msg'), '/register', function (b) {
    var errors = {};
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(b.username)) errors.username = 'Use 3 to 24 letters, numbers, underscores or hyphens.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errors.email = 'Enter a valid email address.';
    if (b.password.length < 10) errors.password = 'Use at least 10 characters.';
    if (b.password !== b.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    return Object.keys(errors).length ? errors : null;
  });

  var meter = document.getElementById('pw-meter');
  document.getElementById('reg-pw').addEventListener('input', function (e) {
    var v = e.target.value;
    var score = Math.min(4, (v.length >= 10) + (v.length >= 14) + (/[A-Z]/.test(v) && /[a-z]/.test(v)) + (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)));
    meter.style.width = score * 25 + '%';
    meter.style.background = ['#ff5470', '#ff5470', '#ffc247', '#3dffa0', '#19e6ff'][score];
  });

  // ---- live readout from public data
  function loadStatus() {
    Promise.all([RC.api('/config', { quiet: true }), RC.api('/leaderboard?pageSize=10', { quiet: true })]).then(function (res) {
      var cfg = res[0].data, lb = res[1].data;
      registrationOpen = cfg.registrationOpen !== false;
      openers.register.disabled = !registrationOpen;
      if (!registrationOpen) openers.register.title = 'Registration is closed';
      document.getElementById('ro-challenges').textContent = cfg.challengeCount;
      document.getElementById('ro-players').textContent = lb.total;
      document.getElementById('boot-state').textContent = 'Online';
      var banner = document.getElementById('status-banner');
      banner.textContent = registrationOpen ? 'All Systems Are Operational' : 'Registration Is Closed';

      var rows = document.getElementById('status-rows');
      RC.clear(rows);
      if (!lb.rows.length) rows.appendChild(h('tr', null, h('td', { colspan: 4, text: 'No operators on the board yet. Be the first.' })));
      lb.rows.slice(0, 2).forEach(function (r) {
        rows.appendChild(h('tr', null, h('td', { text: '#' + r.rank }), h('td', { text: r.username }),
          h('td', { text: r.score + ' / ' + lb.maxScore }), h('td', { text: r.status === 'completed' ? 'CLEAR' : r.solved + '/' + r.total })));
      });
      var chart = document.getElementById('ro-chart');
      RC.clear(chart);
      var buckets = [0, 0, 0, 0, 0, 0, 0, 0];
      lb.rows.forEach(function (r) { buckets[Math.min(7, Math.floor(r.score / (lb.maxScore / 8)))] += 1; });
      var max = Math.max.apply(null, buckets) || 1;
      buckets.forEach(function (n) { chart.appendChild(h('span', { style: 'height:' + Math.max(4, (n / max) * 100) + '%' })); });
    }).catch(function () {
      document.getElementById('status-banner').textContent = 'Status feed unavailable';
    });
  }
  loadStatus();

  // ---- already signed in?
  RC.api('/me', { quiet: true }).then(function (r) {
    if (r.data && r.data.authenticated) window.location.replace(r.data.user.role === 'admin' ? '/admin' : '/dashboard');
  });

  var wanted = params.get('form');
  if (wanted === 'login' || wanted === 'register') show(wanted, false);
})();
