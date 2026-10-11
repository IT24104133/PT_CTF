// A small generic data-table controller: server-side pagination/sort/filter against a PH.get
// endpoint, rendered into a container. Reused by Directory, HR Requests, IT Tickets, Documents,
// Audit Log, Training, and anywhere else a paginated list shows up, so each page only supplies
// its column list and filter fields instead of re-implementing paging.
window.PHTable = (function () {
  'use strict';
  const esc = PH.esc;

  // opts: { root, endpoint, columns:[{key,label,sortKey?,render?}], filters:[{key,el}], pageSizes, emptyText, rowHref? }
  function create(opts) {
    let state = { search: '', page: 1, pageSize: opts.pageSizes ? opts.pageSizes[0] : 25, sort: opts.defaultSort || '', dir: 'asc', filters: {} };
    const root = opts.root;
    root.innerHTML =
      '<div class="ph-table-wrap"><div class="ph-table-scroll"><table class="ph-table"><thead><tr>' +
      opts.columns.map((c) => '<th' + (c.sortKey ? ' class="sortable" data-sort="' + c.sortKey + '"' : '') + '>' + esc(c.label) + '</th>').join('') +
      '</tr></thead><tbody id="' + opts.id + '-body"></tbody></table></div>' +
      '<div class="ph-table-foot"><span id="' + opts.id + '-count"></span>' +
      '<div class="ph-pager" id="' + opts.id + '-pager"></div></div></div>';

    const tbody = root.querySelector('#' + opts.id + '-body');
    const countEl = root.querySelector('#' + opts.id + '-count');
    const pagerEl = root.querySelector('#' + opts.id + '-pager');

    root.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.sort = key; state.dir = 'asc'; }
        state.page = 1;
        load();
      });
    });

    function skeleton() {
      tbody.innerHTML = Array.from({ length: 6 }).map(() =>
        '<tr>' + opts.columns.map(() => '<td><div class="ph-skeleton ph-skel-row"></div></td>').join('') + '</tr>',
      ).join('');
    }

    async function load() {
      skeleton();
      const params = new URLSearchParams();
      if (state.search) params.set('search', state.search);
      if (state.sort) { params.set('sort', state.sort); params.set('dir', state.dir); }
      params.set('page', state.page);
      params.set('pageSize', state.pageSize);
      for (const [k, v] of Object.entries(state.filters)) if (v) params.set(k, v);
      const r = await PH.get(opts.endpoint + '?' + params.toString());
      if (!r.ok) {
        tbody.innerHTML = '<tr><td colspan="' + opts.columns.length + '"><div class="ph-empty">Unable to load this list right now.</div></td></tr>';
        countEl.textContent = '';
        pagerEl.innerHTML = '';
        return;
      }
      const results = r.data.results || [];
      if (!results.length) {
        tbody.innerHTML = '<tr><td colspan="' + opts.columns.length + '"><div class="ph-empty">' + esc(opts.emptyText || 'No records found.') + '</div></td></tr>';
      } else {
        tbody.innerHTML = results.map((row) => {
          const cells = opts.columns.map((c) => '<td>' + (c.render ? c.render(row) : esc(row[c.key])) + '</td>').join('');
          return opts.rowHref ? '<tr class="ph-row-link" data-href="' + esc(opts.rowHref(row)) + '">' + cells + '</tr>' : '<tr>' + cells + '</tr>';
        }).join('');
        if (opts.rowHref) {
          tbody.querySelectorAll('tr.ph-row-link').forEach((tr) => {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => { window.location.href = tr.dataset.href; });
          });
        }
      }
      const total = r.data.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
      countEl.textContent = total ? ((state.page - 1) * state.pageSize + 1) + '–' + Math.min(total, state.page * state.pageSize) + ' of ' + total : '0 results';
      pagerEl.innerHTML =
        '<button type="button" data-act="first">&laquo;</button><button type="button" data-act="prev">&lsaquo;</button>' +
        '<span>Page ' + state.page + ' of ' + totalPages + '</span>' +
        '<button type="button" data-act="next">&rsaquo;</button><button type="button" data-act="last">&raquo;</button>' +
        '<select id="' + opts.id + '-pagesize">' + (opts.pageSizes || [25, 50, 100]).map((n) => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + ' / page</option>').join('') + '</select>';
      pagerEl.querySelector('[data-act=first]').disabled = state.page <= 1;
      pagerEl.querySelector('[data-act=prev]').disabled = state.page <= 1;
      pagerEl.querySelector('[data-act=next]').disabled = state.page >= totalPages;
      pagerEl.querySelector('[data-act=last]').disabled = state.page >= totalPages;
      pagerEl.querySelector('[data-act=first]').addEventListener('click', () => { state.page = 1; load(); });
      pagerEl.querySelector('[data-act=prev]').addEventListener('click', () => { state.page = Math.max(1, state.page - 1); load(); });
      pagerEl.querySelector('[data-act=next]').addEventListener('click', () => { state.page = Math.min(totalPages, state.page + 1); load(); });
      pagerEl.querySelector('[data-act=last]').addEventListener('click', () => { state.page = totalPages; load(); });
      pagerEl.querySelector('#' + opts.id + '-pagesize').addEventListener('change', (e) => { state.pageSize = parseInt(e.target.value, 10); state.page = 1; load(); });
    }

    return {
      load,
      setSearch(v) { state.search = v; state.page = 1; load(); },
      setFilter(key, v) { state.filters[key] = v; state.page = 1; load(); },
    };
  }

  function badge(status) {
    const map = {
      Active: 'green', Approved: 'green', Completed: 'green', Resolved: 'green', Closed: 'gray', Open: 'blue',
      Pending: 'amber', 'In Progress': 'blue', 'On Leave': 'amber', Probation: 'amber', 'Notice Period': 'amber',
      Rejected: 'red', Cancelled: 'gray', Suspended: 'red', Inactive: 'gray', Overdue: 'red', Urgent: 'red', High: 'amber',
    };
    return '<span class="ph-badge-pill ' + (map[status] || 'gray') + '">' + esc(status) + '</span>';
  }

  return { create, badge };
})();
