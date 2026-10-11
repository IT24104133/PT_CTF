(function () {
  'use strict';
  var button = document.getElementById('entry-hint-toggle');
  var hint = document.getElementById('entry-hint');
  button.addEventListener('click', function () {
    var expanded = button.getAttribute('aria-expanded') === 'true';
    hint.hidden = expanded;
    button.setAttribute('aria-expanded', String(!expanded));
    button.textContent = expanded ? 'Hint' : 'Hide hint';
  });
})();
