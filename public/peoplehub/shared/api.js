// Tiny fetch wrapper shared by every PeopleHub page. Centralizes the one behavior every page
// needs: a 401 from the API means "not signed into PeopleHub" and should bounce to login.html,
// exactly once, without every page re-implementing that check.
window.PH = (function () {
  'use strict';

  async function call(path, opts) {
    opts = opts || {};
    const res = await fetch('/api/peoplehub' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    if (res.status === 401 && !opts.allow401) {
      window.location.href = '/peoplehub/login.html';
      return new Promise(() => {}); // never resolves; we're navigating away
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    return { status: res.status, ok: res.ok, data };
  }

  function get(path, opts) { return call(path, opts); }
  function post(path, body, opts) { return call(path, Object.assign({ method: 'POST', body: body || {} }, opts)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function initials(first, last) {
    return ((first || '?')[0] + (last || '?')[0]).toUpperCase();
  }

  function toast(message, kind) {
    let host = document.getElementById('ph-toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ph-toasts';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'ph-toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 3200);
  }

  return { get, post, esc, fmtDate, initials, toast };
})();
