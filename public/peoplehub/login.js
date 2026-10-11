(function () {
  'use strict';
  const form = document.getElementById('ph-login-form');
  const msg = document.getElementById('ph-login-msg');
  const btn = document.getElementById('ph-login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.innerHTML = '';
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    const username = document.getElementById('ph-username').value;
    const password = document.getElementById('ph-password').value;
    const r = await PH.post('/auth/login', { username, password }).catch(() => null);
    btn.disabled = false;
    btn.textContent = 'Sign In';
    if (!r || !r.ok) {
      msg.innerHTML = '<div class="ph-login-msg error">' + PH.esc((r && r.data && r.data.error) || 'Something went wrong. Please try again.') + '</div>';
      return;
    }
    window.location.href = 'dashboard.html';
  });

  document.getElementById('ph-sso-btn').addEventListener('click', () => {
    msg.innerHTML = '<div class="ph-login-msg error">Single sign-on is not available for this account. Use your work email and password.</div>';
  });
  document.getElementById('ph-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    msg.innerHTML = '<div class="ph-login-msg">A password reset link has been sent if that account exists.</div>';
  });

  // If already signed in, skip the login page entirely. allow401 so an unauthenticated visitor
  // (the normal case here) doesn't trigger api.js's default redirect-to-login loop.
  PH.get('/me', { allow401: true }).then((r) => { if (r.ok) window.location.href = 'dashboard.html'; }).catch(() => {});
})();
