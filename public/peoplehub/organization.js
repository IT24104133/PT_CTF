(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'organization.html', title: 'Organization' });
  if (!me) return;

  const r = await PH.get('/organization');
  const treeEl = document.getElementById('ph-org-tree');
  if (!r.ok) { treeEl.innerHTML = '<div class="ph-empty">Unable to load the organization chart.</div>'; return; }

  const byId = new Map(r.data.employees.map((e) => [e.employee_id, e]));
  const childrenOf = new Map();
  const roots = [];
  for (const e of r.data.employees) {
    if (e.manager_id && byId.has(e.manager_id)) {
      if (!childrenOf.has(e.manager_id)) childrenOf.set(e.manager_id, []);
      childrenOf.get(e.manager_id).push(e);
    } else {
      roots.push(e);
    }
  }

  function nodeHtml(e, isRoot) {
    const kids = childrenOf.get(e.employee_id) || [];
    return (
      '<div class="ph-org-node' + (isRoot ? ' root' : '') + '" data-name="' + esc((e.first_name + ' ' + e.last_name + ' ' + e.job_title).toLowerCase()) + '">' +
        '<div class="ph-org-row">' +
          (kids.length ? '<button type="button" class="ph-org-toggle" data-toggle>−</button>' : '<span style="width:18px;"></span>') +
          '<div class="ph-org-card"><a href="employee-profile.html?id=' + esc(e.employee_id) + '">' + esc(e.first_name + ' ' + e.last_name) + '</a><small>' + esc(e.job_title) + ' &middot; ' + esc(e.department) + '</small></div>' +
        '</div>' +
        (kids.length ? '<div class="ph-org-children">' + kids.map((k) => nodeHtml(k, false)).join('') + '</div>' : '') +
      '</div>'
    );
  }

  treeEl.innerHTML = roots.map((r2) => nodeHtml(r2, true)).join('') || '<div class="ph-empty">No organization data.</div>';

  treeEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-toggle]');
    if (!btn) return;
    const kids = btn.closest('.ph-org-node').querySelector('.ph-org-children');
    const collapsed = kids.classList.toggle('collapsed');
    btn.textContent = collapsed ? '+' : '−';
  });

  document.getElementById('ph-org-expand').addEventListener('click', () => {
    treeEl.querySelectorAll('.ph-org-children').forEach((k) => k.classList.remove('collapsed'));
    treeEl.querySelectorAll('[data-toggle]').forEach((b) => b.textContent = '−');
  });
  document.getElementById('ph-org-collapse').addEventListener('click', () => {
    treeEl.querySelectorAll('.ph-org-children').forEach((k) => k.classList.add('collapsed'));
    treeEl.querySelectorAll('[data-toggle]').forEach((b) => b.textContent = '+');
  });

  let searchTimer = null;
  document.getElementById('ph-org-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim().toLowerCase();
    searchTimer = setTimeout(() => {
      const nodes = treeEl.querySelectorAll('.ph-org-node');
      if (!q) { nodes.forEach((n) => { n.style.display = ''; }); return; }
      nodes.forEach((n) => {
        const match = n.dataset.name.includes(q);
        n.style.display = match || n.querySelector('[data-name*="' + CSS.escape(q) + '"]') ? '' : 'none';
        if (match) {
          const kids = n.querySelector('.ph-org-children');
          if (kids) kids.classList.remove('collapsed');
        }
      });
    }, 200);
  });
})();
