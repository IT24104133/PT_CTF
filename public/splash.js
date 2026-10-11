(function () {
  'use strict';

  var root = document.documentElement;
  var splash = document.getElementById('splash');
  // The head script adds the "splash" class only on a first visit in this tab.
  if (!splash || !root.classList.contains('splash')) return;

  var page = document.querySelector('.page');
  if (page) page.inert = true;                       // no tabbing into the login form behind the scene

  var acts = Array.prototype.slice.call(splash.querySelectorAll('.act'));
  var dots = Array.prototype.slice.call(splash.querySelectorAll('.sp-dots i'));
  var timers = [];
  var finished = false;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  // When each act appears and disappears (ms). The last act stays until the splash ends.
  var plan = [
    { show: 200,  hide: 3300 },   // welcome
    { show: 3700, hide: 6600 },   // powered by
    { show: 7000, hide: null }    // your game begins + advice
  ];
  var END = 14200;

  acts.forEach(function (act, i) {
    later(function () {
      act.classList.add('on'); SolsticeSound.play('reveal');
      dots.forEach(function (d, j) { d.classList.toggle('on', j === i); });
    }, plan[i].show);
    if (plan[i].hide) {
      later(function () { act.classList.add('out'); }, plan[i].hide);
      later(function () { act.classList.remove('on', 'out'); }, plan[i].hide + 700);
    }
  });
  later(finish, END);

  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
  }
  document.addEventListener('keydown', onKey);
  document.getElementById('sp-skip').addEventListener('click', finish);

  // Move on to the login page.
  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    try { sessionStorage.setItem('sx-splash', '1'); } catch (e) {}

    splash.classList.add('leave');                   // scene fades out
    if (page) page.inert = false;
    document.body.classList.add('entered');          // login page rises in underneath

    setTimeout(function () { root.classList.remove('splash'); }, 950);
    setTimeout(function () {
      document.body.classList.remove('entered');     // so the shake on a wrong login still works
      var u = document.getElementById('username');
      if (u && window.matchMedia && window.matchMedia('(pointer: fine)').matches) u.focus({ preventScroll: true });
    }, 2600);
  }
})();
