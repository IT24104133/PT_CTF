(function () {
  'use strict';

  // Small DOM builder. Text always goes through text nodes, so usernames can never inject markup.
  function h(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    for (var i = 2; i < arguments.length; i += 1) append(node, arguments[i]);
    return node;
  }
  function append(node, child) {
    if (Array.isArray(child)) return child.forEach(function (c) { append(node, c); });
    if (child === null || child === undefined || child === false) return;
    node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  function api(path, options) {
    var opts = options || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) {
      init.method = opts.method || 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch('/api/platform' + path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && !opts.quiet) { window.location.href = '/?form=login&next=' + encodeURIComponent(location.pathname); }
        return { ok: res.ok, status: res.status, data: data, retryAfter: res.headers.get('Retry-After') };
      });
    });
  }

  var serverOffset = 0;
  function syncClock(serverTime) { if (serverTime) serverOffset = serverTime - Date.now(); }
  function serverNow() { return Date.now() + serverOffset; }

  function duration(ms) {
    if (ms === null || ms === undefined) return '--';
    var total = Math.max(0, Math.floor(ms / 1000));
    var hrs = Math.floor(total / 3600);
    var mins = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
  }
  function dateTime(ts) {
    if (!ts) return '--';
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function ago(ts) {
    if (!ts) return '--';
    var s = Math.max(0, Math.floor((serverNow() - ts) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  var STATUS = {
    not_started: ['Not started', ''], in_progress: ['In progress', 'cyan'], completed: ['Completed', 'ok'],
    active: ['Active', 'ok'], suspended: ['Suspended', 'warn'], disqualified: ['Disqualified', 'bad'],
  };
  function statusBadge(key) {
    var s = STATUS[key] || [key, ''];
    return h('span', { class: 'badge ' + s[1], text: s[0] });
  }

  function toast(message, isError) {
    var el = h('div', { class: 'toast' + (isError ? ' error' : ''), role: 'status', text: message });
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  function debounce(fn, wait) {
    var timer;
    return function () { clearTimeout(timer); timer = setTimeout(fn, wait); };
  }

  // Live updates: the server only says "something changed"; each page refetches what it shows.
  function live(onChange, indicator) {
    if (!window.EventSource) return;
    var refresh = debounce(onChange, 400);
    var source = new EventSource('/api/platform/stream');
    source.addEventListener('change', refresh);
    source.onopen = function () { if (indicator) indicator.classList.add('on'); };
    source.onerror = function () { if (indicator) indicator.classList.remove('on'); };
    window.addEventListener('beforeunload', function () { source.close(); });
  }

  function logout() {
    return api('/logout', { method: 'POST', body: {}, quiet: true }).then(function () { window.location.href = '/'; });
  }

  var LINKS = {
    user: [['/dashboard', 'Dashboard'], ['/challenges', 'Challenges'], ['/leaderboard', 'Leaderboard'], ['/profile', 'Profile']],
    admin: [['/admin', 'Overview'], ['/admin/players', 'Players'], ['/admin/challenges', 'Challenges'], ['/admin/leaderboard', 'Leaderboard'],
      ['/admin/analytics', 'Analytics'], ['/admin/audit', 'Audit log'], ['/admin/settings', 'Settings']],
    anon: [['/leaderboard', 'Leaderboard']],
  };

  function mountNav(me) {
    var role = me && me.authenticated ? me.user.role : 'anon';
    var path = location.pathname.replace(/\/+$/, '') || '/';
    var nav = h('nav', { class: 'nav', 'aria-label': 'Primary' }, LINKS[role].map(function (l) {
      return h('a', { href: l[0], 'aria-current': l[0] === path ? 'page' : null, text: l[1] });
    }));
    var right;
    if (role === 'anon') {
      right = h('a', { class: 'btn small', href: '/?form=login', text: 'Sign in' });
    } else {
      right = h('div', { class: 'who' },
        h('span', { class: 'name', text: me.user.username }),
        role === 'admin' ? h('span', { class: 'badge violet', text: 'Organiser' }) : null,
        h('button', { class: 'btn small ghost', type: 'button', onclick: logout, text: 'Sign out' }));
    }
    var bar = h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: role === 'admin' ? '/admin' : role === 'user' ? '/dashboard' : '/' },
        h('img', { src: '/platform/logo.svg', alt: '' }),
        h('span', null, 'rootCapture', h('small', { text: 'Advanced Cyber Training Platform' }))),
      nav, right);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function boot(options) {
    var opts = options || {};
    return api('/me', { quiet: true }).then(function (r) {
      var me = r.data || { authenticated: false };
      if (opts.require && !me.authenticated) {
        window.location.href = '/?form=login&next=' + encodeURIComponent(location.pathname);
        return new Promise(function () {});
      }
      mountNav(me);
      return me;
    });
  }

  window.RC = {
    h: h, clear: clear, api: api, boot: boot, duration: duration, dateTime: dateTime, ago: ago, statusBadge: statusBadge,
    toast: toast, live: live, syncClock: syncClock, serverNow: serverNow, debounce: debounce,
  };
})();
