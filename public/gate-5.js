(function () {
  'use strict';

  var gate = document.getElementById('gate');
  var form = document.getElementById('unlock');
  var flagEl = document.getElementById('flag');
  var btn = document.getElementById('unlock-btn');
  var status = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var title = document.getElementById('gate-title');
  var lead = document.getElementById('gate-lead');
  var eyebrow = document.getElementById('gate-eyebrow');
  var tbState = document.getElementById('tb-state');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  // The lock opens, then we head into Stage 2.
  function open(go, message) {
    busy = true;
    gate.classList.remove('deny');
    gate.classList.add('open');
    SolsticeSound.play('unlock');
    eyebrow.textContent = 'STAGE 5 · UNSEALED';
    title.textContent = 'Access granted';
    lead.textContent = message || 'The seal is broken. Opening Stage 5...';
    tbState.innerHTML = 'STAGE 5 &nbsp;/&nbsp; OPEN';
    say('Flag accepted.', 'success');
    setTimeout(function () { window.location.href = go; }, reduced ? 300 : 2300);
  }

  function lockFor(seconds) {
    clearInterval(lockTimer);
    var left = seconds;
    btn.disabled = true;
    say('Too many tries. Try again in ' + left + 's.', 'error');
    lockTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(lockTimer);
        btn.disabled = false;
        say('Tip: press Ctrl and Enter to unlock.');
      } else {
        say('Too many tries. Try again in ' + left + 's.', 'error');
      }
    }, 1000);
  }

  // Already unlocked earlier in this session? Offer the way in.
  fetch('/api/progress', { credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 401) { window.location.replace('/'); return null; }
      return r.json();
    })
    .then(function (d) {
      if (!d) return;
      if (!d.solved4) { window.location.replace('/exhibit-d.html'); return; }
      if (!d.dhalf) { window.location.replace('/exhibit-dhalf.html'); return; }
      if (d.stage5) {
        gate.classList.add('open');
        eyebrow.textContent = 'STAGE 5 · UNSEALED';
        title.textContent = 'Stage 5 is open';
        lead.textContent = 'You already broke the seal. Step inside whenever you are ready.';
        tbState.innerHTML = 'STAGE 5 &nbsp;/&nbsp; OPEN';
        form.innerHTML = '<a class="login-btn" href="/exhibit-e.html" style="text-decoration:none"><span class="label">Enter Stage 5</span>' +
          '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
        form.style.opacity = '1';
        form.style.pointerEvents = 'auto';
      }
    })
    .catch(function () {});

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var value = flagEl.value;
    if (!value.trim()) {
      say('Paste the flag first.', 'error');
      deny();
      return;
    }

    btn.disabled = true;
    say('Checking the flag...');

    fetch('/api/unlock-stage5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ flag: value })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data, res: res };
        });
      })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 403) { window.location.replace('/exhibit-d.html'); return; }
        if (r.status === 429) { lockFor(parseInt(r.res.headers.get('Retry-After'), 10) || 60); return; }
        if (r.status === 200 && r.data.ok) { open(r.data.redirect || '/exhibit-e.html?intro=1'); return; }
        btn.disabled = false;
        say(r.data.error || 'That flag is not correct.', 'error');
        deny();
        flagEl.focus();
        flagEl.select();
      })
      .catch(function () {
        btn.disabled = false;
        say('Cannot reach the server. Is it running?', 'error');
      });
  });

  flagEl.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : btn.click(); }
  });
  flagEl.addEventListener('input', function () { gate.classList.remove('deny'); });

  document.getElementById('logout').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function () {}, function () {})
      .then(function () { window.location.replace('/'); });
  });
})();
