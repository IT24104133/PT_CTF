(async function () {
  'use strict';
  const me = await PeopleHubShell.init({ active: 'help.html', title: 'Help & Support' });
  if (!me) return;

  window.__ADMIN_SESSION_TOKEN__ = null;
  PH.get('/feedback/token').then((r) => { if (r.ok) window.__ADMIN_SESSION_TOKEN__ = r.data.token; });

  const queue = document.getElementById('ph-fb-queue');

  async function loadQueue() {
    const r = await PH.get('/feedback?pageSize=10');
    if (!r.ok) { queue.textContent = 'Unable to load the review queue.'; return; }
    if (!r.data.results.length) { queue.innerHTML = '<div class="ph-empty" style="padding:12px;">No messages yet.</div>'; return; }
    // Rendered unescaped, on purpose: this preview shows exactly what an HR reviewer's browser
    // would render when they open the real queue.
    queue.innerHTML = r.data.results.map((f) => '<div class="ph-notif-row">' + f.message + '</div>').join('');
  }

  document.getElementById('ph-fb-send').addEventListener('click', async () => {
    const input = document.getElementById('ph-fb-input');
    const text = input.value;
    if (!text.trim()) return;
    const r = await PH.post('/feedback', { message: text });
    if (r.ok) { input.value = ''; PH.toast('Feedback sent to HR.', 'success'); loadQueue(); }
    else PH.toast((r.data && r.data.error) || 'Unable to send feedback.', 'error');
  });

  loadQueue();
})();
