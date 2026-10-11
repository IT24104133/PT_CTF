(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'documents.html', title: 'Documents' });
  if (!me) return;

  const id = new URLSearchParams(location.search).get('id');
  if (id) { await showDetail(id); return; }

  const table = PHTable.create({
    root: document.getElementById('ph-doc-table'),
    id: 'ph-doc',
    endpoint: '/documents',
    pageSizes: [10, 25, 50],
    emptyText: 'No documents available.',
    rowHref: (row) => 'documents.html?id=' + row.document_id,
    columns: [
      { label: 'Name', render: (r) => '<b>' + esc(r.document_name) + '</b>' },
      { key: 'document_type', label: 'Type' },
      { label: 'Classification', render: (r) => classBadge(r.classification) },
      { label: 'Created', render: (r) => PH.fmtDate(r.created_at) },
    ],
  });
  table.load();

  let t = null;
  document.getElementById('ph-doc-search').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => table.setSearch(e.target.value), 300); });
  document.getElementById('ph-doc-type').addEventListener('change', (e) => table.setFilter('type', e.target.value));

  function classBadge(c) {
    const map = { Public: 'green', Internal: 'blue', Confidential: 'amber', Restricted: 'red' };
    return '<span class="ph-badge-pill ' + (map[c] || 'gray') + '">' + esc(c) + '</span>';
  }

  async function showDetail(docId) {
    document.getElementById('ph-doc-list-view').hidden = true;
    const detail = document.getElementById('ph-doc-detail');
    detail.hidden = false;
    detail.innerHTML = '<div class="ph-skeleton" style="height:160px;"></div>';
    const r = await PH.get('/documents/' + encodeURIComponent(docId));
    if (!r.ok) {
      detail.innerHTML = '<div class="ph-empty">' + esc((r.data && r.data.error) || 'Unable to process your request.') + '</div>' +
        '<a href="documents.html" class="ph-btn ghost sm" style="margin-top:12px;display:inline-flex;">Back to Documents</a>';
      return;
    }
    const d = r.data.document;
    detail.innerHTML =
      '<div class="ph-card-head"><h2 style="margin:0;">' + esc(d.document_name) + '</h2>' + classBadge(d.classification) + '</div>' +
      '<div class="ph-list-row"><span>Type</span><span>' + esc(d.document_type) + '</span></div>' +
      (d.owner ? '<div class="ph-list-row"><span>Owner</span><a href="employee-profile.html?id=' + esc(d.owner.employee_id) + '">' + esc(d.owner.name) + '</a></div>' : '') +
      '<div class="ph-list-row"><span>Created</span><span>' + PH.fmtDate(d.created_at) + '</span></div>' +
      '<div class="ph-list-row"><span>Storage Path</span><span style="font-family:monospace;font-size:12px;">' + esc(d.storage_path) + '</span></div>' +
      '<div style="margin-top:14px;padding:14px;background:var(--ph-bg);border-radius:6px;font-size:13px;white-space:pre-wrap;">' + esc(d.body_excerpt || 'No preview available.') + '</div>' +
      '<a href="documents.html" class="ph-btn ghost sm" style="margin-top:16px;display:inline-flex;">Back to Documents</a>';
  }
})();
