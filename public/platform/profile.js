(function () {
  'use strict';
  var h = RC.h;
  var form = document.getElementById('pw-form');
  var msg = document.getElementById('pw-msg');

  function row(label, value) {
    return h('div', null, h('dt', { class: 'muted', text: label }), h('dd', { style: 'margin:0', text: value }));
  }

  function setErrors(errors) {
    Array.prototype.forEach.call(form.querySelectorAll('.err'), function (el) {
      var m = errors && errors[el.getAttribute('data-for')];
      el.textContent = m || '';
      form.elements[el.getAttribute('data-for')].setAttribute('aria-invalid', m ? 'true' : 'false');
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value };
    var errors = {};
    if (!body.currentPassword) errors.currentPassword = 'Enter your current password.';
    if (body.newPassword.length < 10) errors.newPassword = 'Use at least 10 characters.';
    setErrors(errors);
    if (Object.keys(errors).length) return;
    msg.className = 'form-msg'; msg.textContent = '';
    RC.api('/profile/password', { body: body, quiet: true }).then(function (r) {
      if (r.ok) {
        form.reset();
        msg.className = 'form-msg ok';
        msg.textContent = 'Password updated. Other devices have been signed out.';
        return;
      }
      setErrors(r.data.errors);
      msg.className = 'form-msg error';
      msg.textContent = r.data.error || 'Could not update the password.';
    });
  });

  RC.boot({ require: true }).then(function (me) {
    var u = me.user;
    var acct = document.getElementById('account');
    acct.appendChild(row('Username', u.username));
    acct.appendChild(row('Email', u.email));
    acct.appendChild(row('Role', u.role === 'admin' ? 'Organiser' : 'Player'));
    acct.appendChild(row('Status', u.status));
    acct.appendChild(row('Member since', RC.dateTime(u.createdAt)));
  });
})();
