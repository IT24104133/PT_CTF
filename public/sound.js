// Solstice CTF theme sound. Everything here is synthesized with the Web Audio API — no audio
// files, nothing to download, nothing to license. A quiet ambient drone plays once the player
// interacts with the page (browsers block audio before that), plus short cues for unlocking a
// gate, a wrong flag, solving a stage, and the flag typing itself out. A mute button (added to
// every top bar) remembers the player's choice in this browser via localStorage.
window.SolsticeSound = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var ambient = null;
  var started = false;
  var muted = false;
  try { muted = localStorage.getItem('sx-muted') === '1'; } catch (e) {}

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  // ---------------- short, synthesized cues ----------------
  function tone(freq, dur, type, peak, delay) {
    var c = ensureCtx(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    var g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function sweep(f1, f2, dur, type, peak, delay) {
    var c = ensureCtx(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var o = c.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
    var g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noiseBurst(dur, peak, filterFreq, delay) {
    var c = ensureCtx(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var filt = c.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = filterFreq || 900; filt.Q.value = 0.9;
    var g = c.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t);
  }

  var SFX = {
    click: function () { tone(560, 0.05, 'sine', 0.14); },
    unlock: function () { sweep(220, 700, 0.45, 'sine', 0.28); tone(880, 0.16, 'triangle', 0.18, 0.36); },
    deny: function () { noiseBurst(0.16, 0.22, 700); tone(150, 0.22, 'sawtooth', 0.16, 0.02); },
    success: function () {
      tone(523, 0.1, 'sine', 0.2); tone(659, 0.1, 'sine', 0.2, 0.09); tone(784, 0.1, 'sine', 0.22, 0.18);
      tone(1046, 0.3, 'triangle', 0.22, 0.27); tone(1318, 0.2, 'sine', 0.14, 0.32);
    },
    reveal: function () { sweep(280, 820, 0.4, 'sine', 0.11); },
    boot: function () { tone(220, 0.08, 'square', 0.1); tone(440, 0.1, 'square', 0.12, 0.09); },
    hover: function () { tone(720, 0.035, 'sine', 0.06); },
    type: function () { tone(1100 + Math.random() * 300, 0.02, 'square', 0.035); },
    capture: function () { sweep(320, 1000, 0.22, 'sawtooth', 0.16); },
    open: function () { sweep(160, 60, 0.5, 'sine', 0.14); },
  };

  function play(name) {
    if (muted) return;
    var c = ensureCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    var fn = SFX[name];
    if (fn) fn();
  }

  // ---------------- theme music ----------------
  // Song: Jim Yosef - Link [NCS Release] · Music provided by NoCopyrightSounds
  // Free Download/Stream: http://ncs.io/Link · Watch: http://youtu.be/9iHM6X6uUH8
  var THEME_SRC = 'audio/theme.mp3';
  // Hard ceiling: the music never plays louder than 20% no matter what the slider says.
  var THEME_MAX = 0.20;
  var themeEl = null;
  var volumePct = 100; // percent of THEME_MAX, so 100 = 0.20 actual, 50 = 0.10 actual
  try {
    var savedVol = parseInt(localStorage.getItem('sx-volume'), 10);
    if (!isNaN(savedVol)) volumePct = Math.max(0, Math.min(100, savedVol));
  } catch (e) {}

  function currentVolume() { return (volumePct / 100) * THEME_MAX; }

  // Every page load creates a brand-new <audio> element, so without help the theme would
  // restart from 0:00 on every navigation. Instead we remember where playback was up to (in
  // this tab's sessionStorage) and pick up from there on the next page, so it sounds continuous
  // as the player moves around the site instead of restarting each time.
  var POS_KEY = 'sx-pos';
  var lastPosSaveAt = 0;

  function savePosition() {
    if (!themeEl) return;
    try { sessionStorage.setItem(POS_KEY, String(themeEl.currentTime)); } catch (e) {}
  }

  function restorePosition(el) {
    try {
      var t = parseFloat(sessionStorage.getItem(POS_KEY));
      if (!isNaN(t) && t > 0) el.currentTime = t;
    } catch (e) {}
  }

  window.addEventListener('pagehide', savePosition);
  window.addEventListener('beforeunload', savePosition);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') savePosition();
  });

  function ensureTheme() {
    if (themeEl) return themeEl;
    try {
      themeEl = new Audio(THEME_SRC);
      themeEl.loop = true;
      themeEl.preload = 'auto';
      themeEl.volume = 0;
      restorePosition(themeEl);
      themeEl.addEventListener('timeupdate', function () {
        var now = Date.now();
        if (now - lastPosSaveAt > 1000) { lastPosSaveAt = now; savePosition(); }
      });
    } catch (e) { themeEl = null; }
    return themeEl;
  }

  function fadeAudio(el, to, ms, thenPause) {
    var from = el.volume;
    var steps = Math.max(1, Math.round(ms / 40));
    var i = 0;
    var timer = setInterval(function () {
      i++;
      el.volume = Math.max(0, Math.min(THEME_MAX, from + (to - from) * (i / steps)));
      if (i >= steps) {
        clearInterval(timer);
        el.volume = to;
        if (thenPause && to === 0) el.pause();
      }
    }, 40);
    return timer;
  }

  function startAmbient() {
    var el = ensureTheme();
    if (!el || ambient) return;
    el.volume = 0;
    var p = el.play();
    if (p && p.catch) p.catch(function () {});
    ambient = { el: el, timer: fadeAudio(el, currentVolume(), 2200, false) };
  }

  function stopAmbient() {
    if (!ambient) return;
    clearInterval(ambient.timer);
    fadeAudio(ambient.el, 0, 500, true);
    ambient = null;
  }

  // The browser may allow this to start playing immediately, with no click needed at all — or
  // it may refuse until the visitor interacts with the page at least once. Either way this tries
  // right away and quietly falls back to starting on the first click/key press if blocked.
  function tryAutoStart() {
    if (started || muted) return;
    var el = ensureTheme();
    if (!el) return;
    el.volume = 0;
    var p = el.play();
    if (!p || !p.then) return;
    p.then(function () {
      if (started) return;
      started = true;
      ambient = { el: el, timer: fadeAudio(el, currentVolume(), 2500, false) };
    }).catch(function () { /* blocked until a real interaction — armStart() below covers that */ });
  }

  function setVolume(pct) {
    volumePct = Math.max(0, Math.min(100, Math.round(pct)));
    try { localStorage.setItem('sx-volume', String(volumePct)); } catch (e) {}
    if (ambient && ambient.el) {
      clearInterval(ambient.timer);
      ambient.el.volume = currentVolume();
    }
    syncVolumeSlider();
  }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('sx-muted', muted ? '1' : '0'); } catch (e) {}
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.12);
    if (muted) stopAmbient();
    else if (started) startAmbient();
    else tryAutoStart();
    syncButton();
  }

  function armStart() {
    if (started) return;
    started = true;
    var c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
    if (!muted) { play('boot'); startAmbient(); }
  }
  document.addEventListener('pointerdown', armStart, { once: true, passive: true });
  document.addEventListener('keydown', armStart, { once: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryAutoStart);
  else tryAutoStart();

  // ---------------- mute button + volume slider, present on every page's top bar ----------------
  function syncButton() {
    var btn = document.getElementById('sound-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(!muted));
    btn.title = muted ? 'Sound off. Click to turn on.' : 'Sound on. Click to mute.';
    var on = btn.querySelector('.icon-on'), off = btn.querySelector('.icon-off');
    if (on) on.hidden = muted;
    if (off) off.hidden = !muted;
  }

  function syncVolumeSlider() {
    var el = document.getElementById('sound-volume');
    if (el && el.value != volumePct) el.value = volumePct;
  }

  function initButton() {
    var btn = document.getElementById('sound-toggle');
    if (btn) {
      syncButton();
      btn.addEventListener('click', function () { setMuted(!muted); });
    }
    var vol = document.getElementById('sound-volume');
    if (vol) {
      vol.value = volumePct;
      vol.addEventListener('input', function () { setVolume(vol.value); });
    }
  }
  // Every button, tab, card and link across the site gets one small click cue — a single
  // delegated listener here, so no page script has to wire this up on its own.
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest(
      '.login-btn, .lab-btn, .log-tab, .lock-card[href], .out:not(#sound-toggle), .zoom, .dl, .copy, .gate-back, .next-stage, .sp-skip, .cin-skip, .lb-close'
    );
    if (el) play('click');
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initButton);
  else initButton();

  return {
    play: play,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    setVolume: setVolume,
    getVolume: function () { return volumePct; },
  };
})();
