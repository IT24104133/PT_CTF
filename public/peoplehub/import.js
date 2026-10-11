(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'administration.html', title: 'Employee Data Import' });
  if (!me) return;
  if (!me.caps.admin) {
    document.getElementById('ph-content').innerHTML = '<div class="ph-card"><div class="ph-empty">You do not have access to Employee Data Import.</div></div>';
    return;
  }

  const xmlEl = document.getElementById('ph-import-xml');
  const msgEl = document.getElementById('ph-import-msg');
  const previewEl = document.getElementById('ph-import-preview');
  const importBtn = document.getElementById('ph-import-go');

  document.getElementById('ph-import-choose').addEventListener('click', () => document.getElementById('ph-import-file').click());
  document.getElementById('ph-import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { xmlEl.value = reader.result; };
    reader.readAsText(file);
  });

  document.getElementById('ph-import-validate').addEventListener('click', async () => {
    msgEl.innerHTML = '';
    previewEl.hidden = true;
    importBtn.disabled = true;
    const r = await PH.post('/import/validate', { xml: xmlEl.value });
    if (!r.ok || !r.data.valid) {
      msgEl.innerHTML = '<div class="ph-login-msg error">' + esc((r.data && r.data.message) || 'Import validation failed.') + '</div>';
      return;
    }
    msgEl.innerHTML = '<div class="ph-badge-pill green" style="display:inline-block;">' + esc(r.data.message) + '</div>';
    document.getElementById('pv-name').textContent = r.data.preview.name || '—';
    document.getElementById('pv-role').textContent = r.data.preview.role || '—';
    document.getElementById('pv-note').textContent = r.data.preview.note || '—';
    previewEl.hidden = false;
    importBtn.disabled = false;
  });

  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    const r = await PH.post('/import/process', { xml: xmlEl.value });
    if (!r.ok || !r.data.imported) {
      msgEl.innerHTML = '<div class="ph-login-msg error">' + esc((r.data && r.data.message) || 'Import failed.') + '</div>';
      importBtn.disabled = false;
      return;
    }
    let html = '<div class="ph-login-msg" style="background:#e8f5ee;color:var(--ph-success);border:1px solid #8fd6ab;">' + esc(r.data.message) + '</div>';
    if (r.data.leakedText) html += '<pre style="margin-top:10px;padding:12px;background:var(--ph-bg);border-radius:6px;font-size:12px;white-space:pre-wrap;">' + esc(r.data.leakedText) + '</pre>';
    msgEl.innerHTML = html;
    loadHistory();
    loadSummary();
  });

  async function loadSummary() {
    const r = await PH.get('/import/history?pageSize=1');
    if (!r.ok || !r.data.results.length) return;
    const last = r.data.results[0];
    const kpis = document.querySelectorAll('#ph-import-summary .n');
    kpis[0].textContent = last.records_processed;
    kpis[1].textContent = last.records_success;
    kpis[2].textContent = last.records_rejected;
    kpis[3].textContent = last.warnings ? '1' : '0';
  }

  function loadHistory() {
    PHTable.create({
      root: document.getElementById('ph-import-history'), id: 'ph-imphist', endpoint: '/import/history', pageSizes: [10, 25],
      emptyText: 'No import history yet.',
      columns: [
        { key: 'filename', label: 'File' }, { label: 'Status', render: (r) => PHTable.badge(r.status.split(' ')[0]) },
        { key: 'records_processed', label: 'Processed' }, { key: 'records_success', label: 'Success' },
        { key: 'records_rejected', label: 'Rejected' }, { label: 'Warnings', render: (r) => r.warnings ? esc(r.warnings) : '—' },
        { label: 'Date', render: (r) => PH.fmtDate(r.created_at) },
      ],
    }).load();
  }

  loadSummary();
  loadHistory();
})();
