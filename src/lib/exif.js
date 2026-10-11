// Minimal EXIF reader for JPEG files. No dependencies.
// Used by seed.js to read the Stage 2 answers straight from the evidence photo, so the
// answer key can never disagree with the file players download.
//
// Try it on any photo:   node lib/exif.js evidence/office.jpg
const fs = require('fs');

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function readExif(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Not a JPEG file');
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) { pos += 1; continue; }
    const marker = buf[pos + 1];
    if (marker === 0xff) { pos += 1; continue; }                 // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break;               // image data starts, no more headers
    const len = buf.readUInt16BE(pos + 2);
    if (marker === 0xe1 && buf.toString('latin1', pos + 4, pos + 10) === 'Exif\0\0') {
      return parseTiff(buf.subarray(pos + 10, pos + 2 + len));
    }
    pos += 2 + len;
  }
  return null;
}

function parseTiff(t) {
  const order = t.toString('latin1', 0, 2);
  const le = order === 'II';
  if (!le && order !== 'MM') return null;
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  if (u16(2) !== 42) return null;

  function value(type, count, o) {
    const out = [];
    for (let i = 0; i < count; i++) {
      if (type === 3) out.push(u16(o + 2 * i));
      else if (type === 4) out.push(u32(o + 4 * i));
      else if (type === 5) {
        const num = u32(o + 8 * i), den = u32(o + 8 * i + 4);
        out.push(den ? num / den : 0);
      } else out.push(t[o + i]);
    }
    return count === 1 ? out[0] : out;
  }

  function ifd(offset) {
    const tags = {};
    if (!offset || offset + 2 > t.length) return tags;
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > t.length) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const size = (TYPE_SIZE[type] || 1) * count;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (at + size > t.length) continue;
      tags[tag] = type === 2 ? t.toString('latin1', at, at + count).replace(/\0[\s\S]*$/, '') : value(type, count, at);
    }
    return tags;
  }

  const ifd0 = ifd(u32(4));
  const exif = typeof ifd0[0x8769] === 'number' ? ifd(ifd0[0x8769]) : {};
  const gpsTags = typeof ifd0[0x8825] === 'number' ? ifd(ifd0[0x8825]) : {};

  let gps = null;
  if (Array.isArray(gpsTags[2]) && Array.isArray(gpsTags[4])) {
    const deg = (a) => a[0] + a[1] / 60 + a[2] / 3600;
    let lat = deg(gpsTags[2]), lon = deg(gpsTags[4]);
    if (String(gpsTags[1] || '').toUpperCase().startsWith('S')) lat = -lat;
    if (String(gpsTags[3] || '').toUpperCase().startsWith('W')) lon = -lon;
    gps = { lat, lon };
  }

  return {
    modified: ifd0[0x0132] || null,          // "Modify Date": when the file was last changed
    original: exif[0x9003] || null,          // "Date/Time Original": when the photo was taken
    digitized: exif[0x9004] || null,
    make: ifd0[0x010f] || null,
    model: ifd0[0x0110] || null,
    gps,
  };
}

function readExifFile(file) {
  return readExif(fs.readFileSync(file));
}

module.exports = { readExif, readExifFile };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node lib/exif.js <photo.jpg>'); process.exit(1); }
  try {
    const x = readExifFile(file);
    if (!x) console.log('No EXIF data found in this file.');
    else console.log(JSON.stringify(x, null, 2));
  } catch (e) { console.error(e.message); process.exit(1); }
}
