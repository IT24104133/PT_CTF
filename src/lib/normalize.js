// Answer cleaning shared by seed.js (when hashing) and server.js (when checking).
// Both sides must clean text exactly the same way, so keep it in one place.
const crypto = require('crypto');

// "Wausan-ro 17-gil" -> "wausanro17gil". Works for Hangul and other scripts too.
function text(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')          // drop combining marks, e.g. strikethrough
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ''); // keep letters and digits only
}

// "0507-1338-6304" and "+82 507 1338 6304" -> "050713386304"
function phone(s) {
  let d = String(s).replace(/\D+/g, '');
  if (d.startsWith('82')) d = '0' + d.slice(2);
  return d;
}

// Login fields. Copy and paste often adds things nobody can see: a trailing space or
// line break, a non-breaking space, a zero-width mark, a full-width look-alike character.
// Removing those lets the right credentials work however they were entered.
function credential(s) {
  return String(s)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    .replace(/\p{Cc}/gu, '')
    .trim();
}

// Pulls an 11 character YouTube id out of a link or a bare id. Ids are case sensitive.
function videoId(s) {
  const t = String(s).trim();
  const m =
    /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(t) ||
    /^([A-Za-z0-9_-]{11})$/.exec(t);
  return m ? m[1] : null;
}

function hmac(salt, value) {
  return crypto.createHmac('sha256', salt).update(String(value)).digest('hex');
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

module.exports = { text, phone, credential, videoId, hmac, safeEqualHex };
