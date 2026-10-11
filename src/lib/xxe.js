// A small, genuinely vulnerable XML entity resolver for the bulk-import (XXE) lab. It parses a
// real DOCTYPE internal subset, declares entities the way a naive parser with external entities
// left on would, and substitutes &name; anywhere in the document -- SYSTEM entities included.
// SYSTEM identifiers resolve against a sandboxed "filesystem" (a plain object), never the real
// one, so any well-formed XXE payload works on its own merits while the process stays safe to
// expose. This is not a general XML parser: it only understands enough structure (DOCTYPE +
// ENTITY + a couple of flat <tag>text</tag> fields) to run this one lab.
'use strict';

const MAX_ENTITY_DEPTH = 8;
const MAX_OUTPUT_LEN = 20000;

function makeSandboxFs(files) {
  const map = new Map(Object.entries(files || {}));
  return {
    read(identifier) {
      const key = String(identifier).trim();
      if (map.has(key)) return map.get(key);
      const norm = key.replace(/\\/g, '/').replace(/^file:\/\/(?!\/)/, 'file:///');
      return map.has(norm) ? map.get(norm) : null;
    },
  };
}

function stripComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '');
}

// Pulls <!ENTITY name "value"> and <!ENTITY name SYSTEM "identifier"> out of a DOCTYPE internal
// subset, in declaration order (an entity may reference one declared earlier).
function parseEntities(doctypeBody, fs) {
  const entities = new Map();
  const unresolved = [];
  const re = /<!ENTITY\s+([A-Za-z_][\w.-]*)\s+(?:SYSTEM\s+["']([^"']*)["']|["']([^"']*)["'])\s*>/g;
  let m;
  while ((m = re.exec(doctypeBody))) {
    const [, name, systemRef, literal] = m;
    if (systemRef !== undefined) {
      const content = fs.read(systemRef);
      if (content === null) unresolved.push({ name, ref: systemRef });
      entities.set(name, content === null ? '' : content);
    } else {
      entities.set(name, literal || '');
    }
  }
  return { entities, unresolved };
}

function expand(text, entities, depth) {
  if (depth > MAX_ENTITY_DEPTH) throw new Error('Entity expansion limit exceeded.');
  const out = text.replace(/&([A-Za-z_][\w.-]*);/g, (whole, name) => {
    if (!entities.has(name)) return whole; // leave &amp; &lt; etc. (and unknown names) alone
    return expand(entities.get(name), entities, depth + 1);
  });
  if (out.length > MAX_OUTPUT_LEN) throw new Error('Entity expansion limit exceeded.');
  return out;
}

function readField(xml, tag) {
  const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(xml);
  return m ? m[1] : null;
}

// files: { "file:///etc/passwd": "...", "file:///etc/solstice/app.conf": "..." }
function importEmployeeXml(xml, files) {
  const fs = makeSandboxFs(files);
  const clean = stripComments(String(xml));

  const doctype = /<!DOCTYPE[^\[>]*\[([\s\S]*?)\]\s*>/i.exec(clean);
  let entities = new Map();
  if (doctype) ({ entities } = parseEntities(doctype[1], fs));

  const body = doctype ? clean.slice(clean.indexOf(doctype[0]) + doctype[0].length) : clean;

  let expanded;
  try {
    expanded = expand(body, entities, 0);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const name = readField(expanded, 'name');
  const role = readField(expanded, 'role');
  const note = readField(expanded, 'note');
  if (name === null && role === null && note === null) {
    return { ok: false, error: 'Could not find a recognisable <employee> record in that XML.' };
  }

  // A leak only counts if a SYSTEM entity's *resolved content* actually made it into a visible
  // field -- not just that one was declared, and not a canned string. Whatever file the payload
  // pointed at is what comes back.
  const systemEntities = [];
  {
    const re = /<!ENTITY\s+([A-Za-z_][\w.-]*)\s+SYSTEM\s+["']([^"']*)["']\s*>/g;
    let m;
    while ((m = re.exec(doctype ? doctype[1] : ''))) systemEntities.push({ name: m[1], ref: m[2] });
  }
  let leaked = false, leakedFrom = null, leakedText = null;
  for (const { name: n, ref } of systemEntities) {
    const value = entities.get(n);
    if (!value) continue;
    if ([name, role, note].some((f) => typeof f === 'string' && f.includes(value))) {
      leaked = true; leakedFrom = ref; leakedText = value;
      break;
    }
  }

  return { ok: true, name, role, note, leaked, leakedFrom, leakedText };
}

module.exports = { importEmployeeXml, makeSandboxFs };
