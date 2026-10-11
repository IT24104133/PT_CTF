(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var gate = document.getElementById('hp-gate');
  var locked = document.getElementById('hp-locked');
  var app = document.getElementById('hp-app');
  var userLine = document.getElementById('hp-user-line');

  var state = { stage3: false, stage4: false, entered: false, loggedIn: false, noteLeaked: false, xxeLeaked: false };

  function showMsg(el, kind, html) {
    el.className = 'hp-msg ' + kind;
    el.innerHTML = html;
  }
  function clearMsg(el) { el.className = ''; el.innerHTML = ''; }

  function applyState() {
    if (!state.stage3) {
      gate.hidden = true; app.hidden = true;
      locked.hidden = false;
      document.getElementById('hp-locked-msg').textContent =
        'This part of the case isn’t open yet. Finish Exhibit B in the case file first, then come back.';
      return;
    }
    if (!state.entered) {
      locked.hidden = true; app.hidden = true;
      gate.hidden = false;
      return;
    }
    gate.hidden = true; locked.hidden = true; app.hidden = false;
    userLine.textContent = state.loggedIn ? 'Signed in (session unverified)' : 'Not signed in';

    var searchBtn = document.getElementById('tab-btn-search');
    var importBtn = document.getElementById('tab-btn-import');
    searchBtn.dataset.locked = state.loggedIn ? '0' : '1';
    importBtn.hidden = !state.stage4;
    importBtn.dataset.locked = state.stage4 ? '0' : '1';

    if (!appliedInitialTab) {
      appliedInitialTab = true;
      var wanted = new URLSearchParams(location.search).get('tab');
      var btn = wanted && document.getElementById('tab-btn-' + wanted);
      if (btn && btn.dataset.locked !== '1' && !btn.hidden) btn.click();
    }
  }
  var appliedInitialTab = false;

  function refreshState() {
    return fetch('/api/hrportal/state', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        state.stage3 = !!d.stage3; state.stage4 = !!d.stage4;
        state.entered = !!d.entered; state.loggedIn = !!d.loggedIn;
        state.noteLeaked = !!d.noteLeaked; state.xxeLeaked = !!d.xxeLeaked;
        var countEl = document.getElementById('hp-stat-count');
        var deptEl = document.getElementById('hp-stat-depts');
        if (countEl && typeof d.employeeCount === 'number') countEl.textContent = d.employeeCount;
        if (deptEl && typeof d.departmentCount === 'number') deptEl.textContent = d.departmentCount;
        applyState();
      })
      .catch(function () {});
  }

  refreshState();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshState(); });

  // ---------- gate ----------
  document.getElementById('hp-enter').addEventListener('click', function () {
    var code = document.getElementById('hp-code').value.trim();
    var msg = document.getElementById('hp-gate-msg');
    if (!code) return;
    fetch('/api/hrportal/enter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ code: code }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (!r.data.ok) { showMsg(msg, 'err', esc(r.data.error || 'Not accepted.')); return; }
        clearMsg(msg);
        refreshState();
      })
      .catch(function () { showMsg(msg, 'err', 'Cannot reach the server.'); });
  });
  document.getElementById('hp-code').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('hp-enter').click(); }
  });

  // ---------- tabs ----------
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('.hp-tab'));
  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.locked === '1') return;
      tabButtons.forEach(function (b) { b.classList.toggle('on', b === btn); });
      var name = btn.dataset.tab;
      ['login', 'search', 'import'].forEach(function (n) {
        document.getElementById('tab-' + n).classList.toggle('on', n === name);
      });
    });
  });

  // ---------- login ----------
  document.getElementById('hp-login-go').addEventListener('click', function () {
    var username = document.getElementById('hp-user').value;
    var password = document.getElementById('hp-pass').value;
    var msg = document.getElementById('hp-login-msg');
    fetch('/api/hrportal/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 403) { showMsg(msg, 'err', esc(r.data.error || 'Locked.')); return; }
        var d = r.data;
        showMsg(msg, d.bypass ? 'ok' : 'plain', esc(d.message || ''));
        if (d.sql) {
          var dbg = document.getElementById('hp-login-debug');
          dbg.hidden = false;
          document.getElementById('hp-login-sql').textContent = d.sql;
        }
        if (d.bypass) refreshState();
      })
      .catch(function () { showMsg(msg, 'err', 'Cannot reach the server.'); });
  });

  // ---------- search ----------
  document.getElementById('hp-search-go').addEventListener('click', function () {
    var q = document.getElementById('hp-q').value;
    var dept = document.getElementById('hp-dept').value;
    var msg = document.getElementById('hp-search-msg');
    var table = document.getElementById('hp-search-table');
    var rows = document.getElementById('hp-search-rows');
    fetch('/api/hrportal/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ q: q, dept: dept }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 403) { showMsg(msg, 'err', esc(r.data.error || 'Locked.')); table.classList.add('hp-hidden'); return; }
        var d = r.data;
        if (!d.success) {
          showMsg(msg, 'err', esc(d.error || 'Query failed.'));
          table.classList.add('hp-hidden');
        } else {
          showMsg(msg, 'plain', (d.results || []).length + ' result(s).');
          rows.innerHTML = (d.results || []).map(function (row) {
            var vals = Object.values(row);
            var leak = d.noteLeaked && vals.some(function (v) { return typeof v === 'string' && v.length > 40; });
            return '<tr' + (leak ? ' style="color:#7a5b00;background:#fff6e0"' : '') + '>' +
              vals.map(function (v) { return '<td>' + esc(v == null ? '' : v) + '</td>'; }).join('') + '</tr>';
          }).join('');
          table.classList.remove('hp-hidden');
        }
        if (d.sql) {
          var dbg = document.getElementById('hp-search-debug');
          dbg.hidden = false;
          document.getElementById('hp-search-sql').textContent = d.sql;
        }
        if (d.noteLeaked) refreshState();
      })
      .catch(function () { showMsg(msg, 'err', 'Cannot reach the server.'); });
  });

  // ---------- import ----------
  document.getElementById('hp-import-go').addEventListener('click', function () {
    var xml = document.getElementById('hp-xml').value;
    var msg = document.getElementById('hp-import-msg');
    if (!xml.trim()) return;
    fetch('/api/hrportal/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ xml: xml }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('/'); return; }
        if (r.status === 403) { showMsg(msg, 'err', esc(r.data.error || 'Locked.')); return; }
        var d = r.data;
        var html = esc(d.message || '');
        if (d.leaked) html += '<span class="leak">' + esc(d.leakedText || '') + '</span>';
        showMsg(msg, d.leaked ? 'ok' : 'plain', html);
        if (d.leaked) refreshState();
      })
      .catch(function () { showMsg(msg, 'err', 'Cannot reach the server.'); });
  });

  ['hp-user', 'hp-pass'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('hp-login-go').click(); }
    });
  });
  document.getElementById('hp-q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('hp-search-go').click(); }
  });
})();
