// Adds or replaces text tags in the EXIF block of a JPEG. Every other tag, and the picture
// itself, is copied across byte for byte. Handles the plain layout phones write: a main table,
// an optional Exif table and an optional GPS table. Files with no EXIF get a fresh block.
const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const POINTERS = new Set([0x8769, 0x8825, 0xa005]); // Exif, GPS and Interop tables

function findExif(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Not a JPEG file');
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) { pos += 1; continue; }
    const marker = buf[pos + 1];
    if (marker === 0xff) { pos += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
    if (marker === 0xda || marker === 0xd9) return null;
    const len = buf.readUInt16BE(pos + 2);
    if (marker === 0xe1 && buf.toString('latin1', pos + 4, pos + 10) === 'Exif\0\0') return { start: pos, end: pos + 2 + len };
    pos += 2 + len;
  }
  return null;
}

// Reads a table into a list of { tag, type, count, data, sub }, following pointers to child tables.
function readTiff(t) {
  const le = t.toString('latin1', 0, 2) === 'II';
  if (!le && t.toString('latin1', 0, 2) !== 'MM') throw new Error('Unreadable EXIF block');
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));

  function table(off) {
    const n = u16(off);
    const list = [];
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const size = (SIZE[type] || 1) * count;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      const entry = { tag, type, count, data: Buffer.from(t.subarray(at, at + size)) };
      if (POINTERS.has(tag) && type === 4 && count === 1) entry.sub = table(u32(e + 8));
      list.push(entry);
    }
    return list;
  }
  return { le, main: table(u32(4)) };
}

function buildTiff(le, mainList) {
  const w16 = (n) => { const b = Buffer.alloc(2); if (le) b.writeUInt16LE(n); else b.writeUInt16BE(n); return b; };
  const w32 = (n) => { const b = Buffer.alloc(4); if (le) b.writeUInt32LE(n); else b.writeUInt32BE(n); return b; };

  // lay the tables out one after another, then put the long values after them
  const tables = [];
  (function collect(list) {
    const rec = { list: list.slice().sort((a, b) => a.tag - b.tag) };
    tables.push(rec);
    for (const e of rec.list) if (e.sub) e.rec = collect(e.sub);
    return rec;
  })(mainList);
  let offset = 8;
  for (const r of tables) { r.offset = offset; offset += 2 + r.list.length * 12 + 4; }

  const heap = [];
  let heapAt = offset;
  const parts = [Buffer.from(le ? 'II' : 'MM', 'latin1'), w16(42), w32(8)];
  for (const r of tables) {
    parts.push(w16(r.list.length));
    for (const e of r.list) {
      let type = e.type, count = e.count, field;
      if (e.sub) { type = 4; count = 1; field = w32(e.rec.offset); }
      else if (e.data.length <= 4) field = Buffer.concat([e.data, Buffer.alloc(4 - e.data.length)]);
      else {
        field = w32(heapAt);
        const padded = e.data.length % 2 ? Buffer.concat([e.data, Buffer.alloc(1)]) : e.data;
        heap.push(padded);
        heapAt += padded.length;
      }
      parts.push(w16(e.tag), w16(type), w32(count), field);
    }
    parts.push(w32(0));
  }
  return Buffer.concat([...parts, ...heap]);
}

// tags: { 0x0132: '2026:09:09 12:07:31', ... } sets text tags in the main table.
function setTextTags(jpeg, tags) {
  const seg = findExif(jpeg);
  let le = false;
  let main = [];
  if (seg) {
    const parsed = readTiff(jpeg.subarray(seg.start + 10, seg.end));
    le = parsed.le;
    main = parsed.main;
  }
  for (const [tag, text] of Object.entries(tags)) {
    const t = Number(tag);
    const data = Buffer.from(String(text) + '\0', 'latin1');
    main = main.filter((e) => e.tag !== t);
    main.push({ tag: t, type: 2, count: data.length, data });
  }
  const tiff = buildTiff(le, main);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  if (body.length + 2 > 0xffff) throw new Error('EXIF block is too large');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length + 2);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), len, body]);
  if (seg) return Buffer.concat([jpeg.subarray(0, seg.start), app1, jpeg.subarray(seg.end)]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

module.exports = { setTextTags };
