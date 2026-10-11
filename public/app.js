(function () {
  'use strict';

  var form = document.getElementById('login');
  var userEl = document.getElementById('username');
  var passEl = document.getElementById('password');
  var btn = document.getElementById('submit');
  var hint = document.getElementById('hint');
  var hintText = document.getElementById('hint-text');

  var EYE_OPEN =
    '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF =
    '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1"/><path d="M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  var DEFAULT_HINT = 'Recover the credentials from the entry gate first.';
  var lockTimer = null;

  // Show / hide toggles. Username starts visible, password starts hidden.
  function setVisible(input, btnEl, visible) {
    if (input.type === 'password') {
      input.type = visible ? 'text' : 'password';
    } else {
      input.classList.toggle('masked', !visible);
    }
    btnEl.innerHTML = visible ? EYE_OPEN : EYE_OFF;
    btnEl.setAttribute('aria-pressed', String(visible));
  }

  Array.prototype.forEach.call(document.querySelectorAll('.eye'), function (b) {
    var input = document.getElementById(b.getAttribute('data-target'));
    var visible = input.type !== 'password';
    setVisible(input, b, visible);
    b.addEventListener('click', function () {
      visible = !visible;
      setVisible(input, b, visible);
      input.focus();
    });
  });

  function say(text, kind) {
    hintText.textContent = text;
    hint.className = 'hint' + (kind ? ' ' + kind : '');
  }

  function unlockStages() {
    var b1 = document.querySelector('#step1 .badge');
    var b2 = document.querySelector('#step2 .badge');
    var b3 = document.querySelector('#step3 .badge');
    var arrows = document.querySelectorAll('.arrow');
    b1.className = 'badge done';
    b2.className = 'badge done';
    b3.className = 'badge on';
    setPill('pill1', 'Completed', 'done');
    setPill('pill2', 'Unlocked', 'done');
    setPill('pill3', 'Available', 'available');
    Array.prototype.forEach.call(arrows, function (a) { a.classList.add('live'); });
  }

  function setPill(id, text, cls) {
    var el = document.getElementById(id);
    el.textContent = text;
    el.className = 'pill' + (cls ? ' ' + cls : '');
  }

  function lockFor(seconds) {
    clearInterval(lockTimer);
    var left = seconds;
    btn.disabled = true;
    say('Too many attempts. Try again in ' + left + 's.', 'error');
    lockTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(lockTimer);
        btn.disabled = false;
        say(DEFAULT_HINT);
      } else {
        say('Too many attempts. Try again in ' + left + 's.', 'error');
      }
    }, 1000);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var username = userEl.value;
    var password = passEl.value;

    if (!username || !password) {
      say('Enter both a username and a password.', 'error');
      return;
    }

    btn.disabled = true;
    say('Checking credentials...');

    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data, res: res };
        });
      })
      .then(function (r) {
        if (r.status === 200 && r.data.ok) {
          SolsticeSound.play('success');
          say('Access granted. Loading Stage 2...', 'success');
          unlockStages();
          setTimeout(function () { window.location.href = r.data.redirect || '/stage2.html'; }, 1400);
          return;
        }
        if (r.status === 429) {
          var wait = parseInt(r.res.headers.get('Retry-After'), 10) || 60;
          lockFor(wait);
          return;
        }
        btn.disabled = false;
        var msg = r.data.error || 'Login failed.';
        if (typeof r.data.remaining === 'number') {
          msg += ' ' + r.data.remaining + ' attempt' + (r.data.remaining === 1 ? '' : 's') + ' left.';
        }
        say(msg, 'error');
        form.classList.remove('shake');
        void form.offsetWidth;
        form.classList.add('shake');
        SolsticeSound.play('deny');
        passEl.select();
      })
      .catch(function () {
        btn.disabled = false;
        say('Cannot reach the server. Is it running?', 'error');
      });
  });

  // Already signed in? Go straight to Stage 2.
  fetch('/api/session', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.authenticated) window.location.replace('/stage2.html'); })
    .catch(function () {});
})();
