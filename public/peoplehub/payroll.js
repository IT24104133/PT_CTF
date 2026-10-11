(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'payroll.html', title: 'Payroll' });
  if (!me) return;

  const card = document.getElementById('ph-payroll-card');

  function render(p) {
    card.innerHTML =
      '<h3>' + esc(p.first_name + ' ' + p.last_name) + '<small style="display:block;color:var(--ph-muted);font-weight:400;">' + esc(p.job_title) + '</small></h3>' +
      '<div class="ph-kpi-row" style="margin-top:14px;">' +
        '<div class="ph-kpi"><div class="n">' + esc(p.salary_band) + '</div><div class="l">Salary Band</div></div>' +
        '<div class="ph-kpi"><div class="n">$' + p.base_salary.toLocaleString() + '</div><div class="l">Base Salary (' + esc(p.currency) + ')</div></div>' +
        '<div class="ph-kpi"><div class="n">' + p.bonus_percentage + '%</div><div class="l">Bonus Target</div></div>' +
        '<div class="ph-kpi"><div class="n">' + esc(p.pay_frequency) + '</div><div class="l">Pay Frequency</div></div>' +
      '</div>' +
      '<p style="margin-top:16px;color:var(--ph-muted);font-size:12.5px;">Payroll status: ' + esc(p.payroll_status) + '. For payslip PDFs or payment history, submit an HR Request under the Payroll category.</p>';
  }

  async function load(id) {
    card.innerHTML = '<div class="ph-skeleton" style="height:120px;"></div>';
    const r = await PH.get('/payroll/' + encodeURIComponent(id));
    if (!r.ok) { card.innerHTML = '<div class="ph-empty">' + esc((r.data && r.data.error) || 'Unable to load payroll information.') + '</div>'; return; }
    render(r.data.payroll);
  }

  if (me.caps.payroll) {
    document.getElementById('ph-payroll-lookup').hidden = false;
    document.getElementById('ph-payroll-go').addEventListener('click', () => {
      const id = document.getElementById('ph-payroll-id').value.trim();
      if (id) load(id);
    });
  }

  if (me.employee) load(me.employee.employee_id);
  else card.innerHTML = '<div class="ph-empty">No employee record linked to this account.</div>';
})();
