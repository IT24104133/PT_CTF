'use strict';
// Password hashing. Argon2id (Node 24.7+ built-in) is used whenever the runtime has it; older
// Node 22 runtimes fall back to scrypt with strong parameters. The algorithm is stored inside
// each hash, so accounts created on one runtime still verify on the other.

const crypto = require('node:crypto');

const ARGON = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 }; // OWASP minimum profile
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const hasArgon2 = typeof crypto.argon2 === 'function';

function argon2id(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.argon2('argon2id', {
      message: Buffer.from(password, 'utf8'), nonce: salt,
      memory: params.memory, passes: params.passes, parallelism: params.parallelism, tagLength: params.tagLength,
    }, (error, tag) => (error ? reject(error) : resolve(tag)));
  });
}

function scrypt(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem },
      (error, key) => (error ? reject(error) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  if (hasArgon2) {
    const tag = await argon2id(password, salt, ARGON);
    return ['argon2id', 'm=' + ARGON.memory + ',t=' + ARGON.passes + ',p=' + ARGON.parallelism,
      salt.toString('base64'), tag.toString('base64')].join('$');
  }
  const key = await scrypt(password, salt, SCRYPT);
  return ['scrypt', 'N=' + SCRYPT.N + ',r=' + SCRYPT.r + ',p=' + SCRYPT.p,
    salt.toString('base64'), key.toString('base64')].join('$');
}

function parseParams(text) {
  const out = {};
  for (const part of text.split(',')) {
    const [k, v] = part.split('=');
    out[k] = Number(v);
  }
  return out;
}

async function verifyPassword(password, stored) {
  try {
    const [algorithm, paramText, saltB64, hashB64] = String(stored).split('$');
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const p = parseParams(paramText);
    let actual;
    if (algorithm === 'argon2id' && hasArgon2) {
      actual = await argon2id(password, salt, { memory: p.m, passes: p.t, parallelism: p.p, tagLength: expected.length });
    } else if (algorithm === 'scrypt') {
      actual = await scrypt(password, salt, { N: p.N, r: p.r, p: p.p, keylen: expected.length, maxmem: SCRYPT.maxmem });
    } else {
      return false;
    }
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (error) {
    return false;
  }
}

// A real hash of a throwaway password, so logins for unknown accounts cost the same time as
// logins for known ones and response timing does not reveal which usernames exist.
let dummyHash = null;
async function verifyAgainstDummy(password) {
  if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(18).toString('hex'));
  await verifyPassword(password, await dummyHash);
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy, algorithm: hasArgon2 ? 'argon2id' : 'scrypt' };
