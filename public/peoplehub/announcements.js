(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'announcements.html', title: 'Announcements' });
  if (!me) return;
  let page = 1;
  const pageSize = 10;

  async function load() {
    const listEl = document.getElementById('ph-ann-list');
    listEl.innerHTML = '<div class="ph-skeleton" style="height:100px;"></div>';
    const r = await PH.get('/announcements?page=' + page + '&pageSize=' + pageSize);
    if (!r.ok) { listEl.innerHTML = '<div class="ph-empty">Unable to load announcements.</div>'; return; }
    listEl.innerHTML = r.data.results.map((a) => (
      '<div class="ph-card">' +
      (a.is_pinned ? '<span class="ph-badge-pill amber">Pinned</span> ' : '') +
      '<h3 style="display:inline;">' + esc(a.title) + '</h3>' +
      '<div style="color:var(--ph-muted);font-size:12px;margin:4px 0 10px;">' + PH.fmtDate(a.published_at) + '</div>' +
      '<p style="margin:0;">' + esc(a.body) + '</p></div>'
    )).join('') || '<div class="ph-empty">No announcements.</div>';
    const totalPages = Math.max(1, Math.ceil(r.data.total / pageSize));
    document.getElementById('ph-ann-count').textContent = r.data.total + ' announcements';
    document.getElementById('ph-ann-pager').innerHTML =
      '<button id="ph-ann-prev"' + (page <= 1 ? ' disabled' : '') + '>&lsaquo; Prev</button>' +
      '<span>Page ' + page + ' of ' + totalPages + '</span>' +
      '<button id="ph-ann-next"' + (page >= totalPages ? ' disabled' : '') + '>Next &rsaquo;</button>';
    const prev = document.getElementById('ph-ann-prev'), next = document.getElementById('ph-ann-next');
    if (prev) prev.addEventListener('click', () => { page--; load(); });
    if (next) next.addEventListener('click', () => { page++; load(); });
  }
  load();
})();
