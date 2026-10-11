// Builds the sidebar + top header once, from data, so no individual page hand-authors that
// chrome. Every page includes api.js + shell.js, has an empty <aside id="ph-sidebar"> and
// <header id="ph-header"> already in its HTML, and calls PeopleHubShell.init({active: '...'})
// once its own content is ready to show.
window.PeopleHubShell = (function () {
  'use strict';
  const esc = PH.esc;

  // section label -> [{href, label, cap}] ; cap is a caps.<name> flag from /api/peoplehub/me,
  // or omitted if every signed-in role can see the link.
  const NAV = [
    { items: [
      { href: 'dashboard.html', label: 'Dashboard' },
      { href: 'profile.html', label: 'My Profile' },
    ] },
    { section: 'People', items: [
      { href: 'employees.html', label: 'Employee Directory', cap: 'directory' },
      { href: 'organization.html', label: 'Organization' },
      { href: 'people-analytics.html', label: 'People Analytics', cap: 'reports' },
    ] },
    { section: 'Time & Pay', items: [
      { href: 'leave.html', label: 'Leave & Attendance' },
      { href: 'payroll.html', label: 'Payroll', cap: 'payroll' },
      { href: 'benefits.html', label: 'Benefits' },
    ] },
    { section: 'Work', items: [
      { href: 'documents.html', label: 'Documents' },
      { href: 'performance.html', label: 'Performance' },
      { href: 'recruitment.html', label: 'Recruitment', cap: 'recruitment' },
    ] },
    { section: 'Support', items: [
      { href: 'hr-requests.html', label: 'HR Requests' },
      { href: 'it-requests.html', label: 'IT Requests' },
      { href: 'policies.html', label: 'Company Policies' },
      { href: 'announcements.html', label: 'Announcements' },
    ] },
    { section: 'Insights', items: [
      { href: 'reports.html', label: 'Reports', cap: 'reports' },
    ] },
    { section: 'System', items: [
      { href: 'administration.html', label: 'Administration', cap: 'admin' },
      { href: 'emergency-access.html', label: 'Emergency Access', cap: 'security' },
      { href: 'settings.html', label: 'Settings' },
    ] },
  ];

  const ICONS = {
    'dashboard.html': 'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z',
    'profile.html': 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-8 9a8 8 0 0 1 16 0',
    'employees.html': 'M16 11a4 4 0 1 0-4-4 M8 21v-2a4 4 0 0 1 4-4h1 M17 21v-2a4 4 0 0 0-3-3.87 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'organization.html': 'M12 3v6M6 21v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M6 21h4M14 21h4M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'people-analytics.html': 'M4 20V10M11 20V4M18 20v-7',
    'leave.html': 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4',
    'payroll.html': 'M12 2v20M17 6.5A4.5 4.5 0 0 0 12.5 4H11a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-1.5A4.5 4.5 0 0 1 7 15.5',
    'benefits.html': 'M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11z',
    'documents.html': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
    'performance.html': 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7-5.4-4.7 7.1-.6z',
    'recruitment.html': 'M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1zM9 5h6v2H9z',
    'hr-requests.html': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    'it-requests.html': 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4z',
    'policies.html': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    'announcements.html': 'M3 11l18-5v12L3 14zM3 11v3a2 2 0 0 0 2 2h1l1 5h3l-1-5',
    'reports.html': 'M3 3v18h18M7 15l4-4 3 3 5-6',
    'administration.html': 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z',
    'emergency-access.html': 'M12 9v4m0 4h.01M10.3 3.9L2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    'settings.html': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.2.6.7 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  };

  function icon(href) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="' + (ICONS[href] || 'M4 4h16v16H4z') + '"/></svg>';
  }

  let meCache = null;

  async function fetchMe() {
    if (meCache) return meCache;
    const r = await PH.get('/me');
    meCache = r.data;
    return meCache;
  }

  function renderSidebar(me, active) {
    const caps = me.caps || {};
    const parts = ['<div class="ph-brand"><span class="ph-logo">SD</span><div><b>Solstice</b><small>PeopleHub</small></div></div>', '<nav class="ph-nav">'];
    for (const group of NAV) {
      const items = group.items.filter((it) => !it.cap || caps[it.cap]);
      if (!items.length) continue;
      if (group.section) parts.push('<div class="ph-nav-section">' + esc(group.section) + '</div>');
      for (const it of items) {
        const isActive = active === it.href;
        parts.push('<a class="ph-nav-link' + (isActive ? ' active' : '') + '" href="' + it.href + '">' + icon(it.href) + '<span>' + esc(it.label) + '</span></a>');
      }
    }
    parts.push('</nav>');
    parts.push(
      '<div class="ph-sidebar-foot">' +
        '<a class="ph-nav-link" href="help.html">' + icon('') + '<span>Help &amp; Support</span></a>' +
        '<div class="ph-side-user">' +
          '<span class="ph-avatar">' + esc(PH.initials(me.employee && me.employee.first_name, me.employee && me.employee.last_name)) + '</span>' +
          '<div><b>' + esc(me.employee ? me.employee.first_name + ' ' + me.employee.last_name : me.username) + '</b><small>' + esc(me.role) + '</small></div>' +
        '</div>' +
        '<button type="button" class="ph-link-btn" id="ph-sidebar-logout">Log out</button>' +
      '</div>',
    );
    document.getElementById('ph-sidebar').innerHTML = parts.join('');
  }

  function renderHeader(me, title) {
    const header = document.getElementById('ph-header');
    header.innerHTML =
      '<button type="button" class="ph-menu-toggle" id="ph-menu-toggle" aria-label="Toggle navigation">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>' +
      '<h1 class="ph-page-title">' + esc(title || '') + '</h1>' +
      '<div class="ph-header-search"><input type="search" id="ph-global-search" placeholder="Search employees, documents, requests...">' +
        '<div class="ph-search-results" id="ph-search-results" hidden></div></div>' +
      '<div class="ph-header-actions">' +
        '<button type="button" class="ph-icon-btn" id="ph-notif-btn" aria-label="Notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="ph-badge" id="ph-notif-count" hidden></span></button>' +
        '<div class="ph-notif-panel" id="ph-notif-panel" hidden></div>' +
        '<div class="ph-user-menu">' +
          '<button type="button" class="ph-user-menu-btn" id="ph-user-menu-btn"><span class="ph-avatar sm">' + esc(PH.initials(me.employee && me.employee.first_name, me.employee && me.employee.last_name)) + '</span></button>' +
          '<div class="ph-user-dropdown" id="ph-user-dropdown" hidden>' +
            '<div class="ph-user-dropdown-head"><b>' + esc(me.employee ? me.employee.first_name + ' ' + me.employee.last_name : me.username) + '</b><small>' + esc(me.role) + '</small></div>' +
            '<a href="profile.html">My Profile</a><a href="settings.html">Account Settings</a><a href="settings.html#security">Security</a>' +
            '<button type="button" id="ph-header-logout">Sign Out</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function wireInteractions() {
    document.getElementById('ph-menu-toggle').addEventListener('click', () => {
      document.getElementById('ph-shell').classList.toggle('ph-sidebar-open');
    });
    async function logout() { await PH.post('/auth/logout', {}).catch(() => {}); window.location.href = '/peoplehub/login.html'; }
    document.getElementById('ph-sidebar-logout').addEventListener('click', logout);
    document.getElementById('ph-header-logout').addEventListener('click', logout);

    const userBtn = document.getElementById('ph-user-menu-btn');
    const userDropdown = document.getElementById('ph-user-dropdown');
    userBtn.addEventListener('click', (e) => { e.stopPropagation(); userDropdown.hidden = !userDropdown.hidden; });

    const notifBtn = document.getElementById('ph-notif-btn');
    const notifPanel = document.getElementById('ph-notif-panel');
    notifBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const opening = notifPanel.hidden;
      notifPanel.hidden = !notifPanel.hidden;
      if (opening) await loadNotifications(notifPanel);
    });

    document.addEventListener('click', () => { userDropdown.hidden = true; notifPanel.hidden = true; hideSearch(); });

    let searchTimer = null;
    const searchInput = document.getElementById('ph-global-search');
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      if (!q) { hideSearch(); return; }
      searchTimer = setTimeout(() => runGlobalSearch(q), 250);
    });
    searchInput.addEventListener('click', (e) => e.stopPropagation());
  }

  function hideSearch() {
    const el = document.getElementById('ph-search-results');
    if (el) el.hidden = true;
  }

  async function loadNotifications(panel) {
    panel.innerHTML = '<div class="ph-notif-loading">Loading…</div>';
    const r = await PH.get('/notifications?pageSize=8');
    if (!r.ok || !r.data.results.length) { panel.innerHTML = '<div class="ph-empty-mini">No notifications.</div>'; return; }
    const unread = r.data.results.filter((n) => !n.is_read).length;
    const countEl = document.getElementById('ph-notif-count');
    if (unread) { countEl.hidden = false; countEl.textContent = unread; } else { countEl.hidden = true; }
    panel.innerHTML =
      '<div class="ph-notif-panel-head"><b>Notifications</b><button type="button" id="ph-mark-all-read">Mark all as read</button></div>' +
      r.data.results.map((n) => (
        '<div class="ph-notif-row' + (n.is_read ? '' : ' unread') + '"><p>' + esc(n.message) + '</p><small>' + PH.fmtDate(n.created_at) + '</small></div>'
      )).join('');
    const markBtn = document.getElementById('ph-mark-all-read');
    if (markBtn) markBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await PH.post('/notifications/mark-all-read', {});
      loadNotifications(panel);
    });
  }

  async function runGlobalSearch(q) {
    const el = document.getElementById('ph-search-results');
    el.hidden = false;
    el.innerHTML = '<div class="ph-notif-loading">Searching…</div>';
    const r = await PH.get('/search?q=' + encodeURIComponent(q));
    if (!r.ok) { el.innerHTML = '<div class="ph-empty-mini">Search service is temporarily unavailable.</div>'; return; }
    const groups = r.data.groups || [];
    if (!groups.length) { el.innerHTML = '<div class="ph-empty-mini">No results.</div>'; return; }
    el.innerHTML = groups.map((g) => (
      '<div class="ph-search-group"><div class="ph-search-group-label">' + esc(g.label) + ' (' + g.items.length + ')</div>' +
      g.items.map((it) => '<a class="ph-search-item" href="' + it.href + '">' + esc(it.title) + '<small>' + esc(it.subtitle || '') + '</small></a>').join('') +
      '</div>'
    )).join('');
  }

  async function init(opts) {
    opts = opts || {};
    const me = await fetchMe();
    if (!me || !me.ok) { window.location.href = '/peoplehub/login.html'; return null; }
    renderSidebar(me, opts.active);
    renderHeader(me, opts.title);
    wireInteractions();
    document.title = (opts.title ? opts.title + ' — ' : '') + 'Solstice PeopleHub';
    return me;
  }

  return { init, fetchMe };
})();
