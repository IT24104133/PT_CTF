// Forgiving readers for the two Stage 2 answers. Players copy values from many different
// tools, so "37.5563, 126.9236", "37° 33' 22.7\" N 126° 55' 24.9\" E" and "N 37.5563 E 126.9236"
// must all work, and so must "2026:08:12 10:24:00", "2026-08-12 10:24" and "12 Aug 2026 10:24 AM".

// ------------------------------------------------------------ coordinates
function hemi(word) {
  return word[0]; // north -> n, south -> s, east -> e, west -> w
}

function groupToDegrees(g) {
  const [d, m = 0, s = 0] = g.nums;
  if (g.nums.length > 1 && (Math.abs(m) >= 60 || Math.abs(s) >= 60)) return null;
  let v = Math.abs(d) + Math.abs(m) / 60 + Math.abs(s) / 3600;
  const negative = g.hem === 's' || g.hem === 'w' || d < 0 || Object.is(d, -0);
  if (negative) v = -v;
  return v;
}

// Returns { lat, lon } in decimal degrees, or null when the text is not a coordinate pair.
function parseCoordinates(input) {
  const s = String(input).toLowerCase().replace(/−/g, '-');
  const re = /(-?\d+(?:\.\d+)?)|(?<![a-z])(north|south|east|west|[nsew])(?![a-z])/g;
  const tokens = [];
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) tokens.push({ num: parseFloat(m[1]), raw: m[1] });
    else tokens.push({ hem: hemi(m[2]) });
  }
  if (!tokens.length) return null;

  // Group the numbers. A hemisphere letter either ends a group ("37.5 N") or starts one ("N 37.5").
  const prefixStyle = 'hem' in tokens[0];
  const groups = [];
  let cur = { nums: [], hem: null };
  for (const t of tokens) {
    if ('num' in t) {
      cur.nums.push(t.raw.startsWith('-') && t.num === 0 ? -0 : t.num);
    } else if (prefixStyle) {
      if (cur.nums.length) groups.push(cur);
      cur = { nums: [], hem: t.hem };
    } else {
      cur.hem = t.hem;
      if (cur.nums.length) groups.push(cur);
      cur = { nums: [], hem: null };
    }
  }
  if (cur.nums.length) groups.push(cur);

  let parts;
  if (groups.length === 2) {
    parts = groups;
  } else if (groups.length === 1) {
    const n = groups[0].nums;
    if (n.length === 2) parts = [{ nums: [n[0]], hem: null }, { nums: [n[1]], hem: null }];
    else if (n.length === 4) parts = [{ nums: n.slice(0, 2), hem: null }, { nums: n.slice(2), hem: null }];
    else if (n.length === 6) parts = [{ nums: n.slice(0, 3), hem: null }, { nums: n.slice(3), hem: null }];
    else return null;
  } else {
    return null;
  }
  if (parts.some((p) => !p.nums.length || p.nums.length > 3)) return null;

  let [a, b] = parts;
  const isLat = (p) => p.hem === 'n' || p.hem === 's';
  const isLon = (p) => p.hem === 'e' || p.hem === 'w';
  if (isLon(a) || isLat(b)) [a, b] = [b, a];               // longitude was written first
  if ((isLat(a) && isLat(b)) || (isLon(a) && isLon(b))) return null;

  let lat = groupToDegrees(a), lon = groupToDegrees(b);
  if (lat === null || lon === null) return null;
  if (!a.hem && !b.hem && Math.abs(lat) > 90 && Math.abs(lon) <= 90) [lat, lon] = [lon, lat];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// Great-circle distance in metres.
function distanceMeters(a, b) {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ------------------------------------------------------------ timestamps
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

function validDate(y, mo, d) {
  return y >= 1970 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

// Finds a calendar date anywhere in the text. Returns { dates, rest } or null, where `rest` is
// the text without the date. More than one date appears only when a numeric day/month order is
// ambiguous, such as 08/12/2026.
function findDate(input) {
  const s = String(input).trim().toLowerCase().replace(/[,–—]/g, ' ');
  let dates = [];
  let m;

  if ((m = /(?<!\d)(\d{4})[-:/.](\d{1,2})[-:/.](\d{1,2})(?!\d)/.exec(s))) {
    dates = [{ y: +m[1], m: +m[2], d: +m[3] }];
  } else if ((m = /(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/.exec(s))) {
    dates = [{ y: +m[3], m: +m[2], d: +m[1] }, { y: +m[3], m: +m[1], d: +m[2] }];   // day first, or month first
  } else if ((m = /(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})(?!\d)/.exec(s))) {
    dates = [{ y: 2000 + +m[3], m: +m[2], d: +m[1] }, { y: 2000 + +m[3], m: +m[1], d: +m[2] }];
  } else if ((m = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?\s+(\d{4})/.exec(s)) && MONTHS[m[2]]) {
    dates = [{ y: +m[3], m: MONTHS[m[2]], d: +m[1] }];
  } else if ((m = /([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/.exec(s)) && MONTHS[m[1]]) {
    dates = [{ y: +m[3], m: MONTHS[m[1]], d: +m[2] }];
  } else {
    return null;
  }
  dates = dates.filter((x) => validDate(x.y, x.m, x.d));
  if (!dates.length) return null;
  return { dates, rest: s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length) };
}

// True when `input` names the same calendar day as `answer`, whatever format either is written in.
function sameDate(input, answer) {
  const a = findDate(input), b = findDate(answer);
  if (!a || !b) return false;
  return a.dates.some((x) => b.dates.some((y) => x.y === y.y && x.m === y.m && x.d === y.d));
}

// Returns { dates: [{y, m, d}, ...], h, mi, s } or null. A time of day is required.
function parseTimestamp(input) {
  const found = findDate(input);
  if (!found) return null;
  const { dates, rest } = found;

  const tm = /(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)\s*(a\.?m\.?|p\.?m\.?)?/.exec(rest);
  if (!tm) return null;
  let h = +tm[1];
  const mi = +tm[2];
  const sec = tm[3] !== undefined ? +tm[3] : null;
  if (tm[4]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (tm[4][0] === 'p' ? 12 : 0);
  }
  if (h > 23 || mi > 59 || (sec !== null && sec > 59)) return null;
  return { dates, h, mi, s: sec };
}

// True when `input` names the same moment as `answer` (both in any format parseTimestamp reads).
// Seconds are compared only when the player typed them.
function sameTimestamp(input, answer) {
  const a = parseTimestamp(input), b = parseTimestamp(answer);
  if (!a || !b) return false;
  const dateOk = a.dates.some((x) => b.dates.some((y) => x.y === y.y && x.m === y.m && x.d === y.d));
  if (!dateOk || a.h !== b.h || a.mi !== b.mi) return false;
  return a.s === null || b.s === null || a.s === b.s;
}

module.exports = { parseCoordinates, distanceMeters, parseTimestamp, sameTimestamp, sameDate };
