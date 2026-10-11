// A tiny seeded PRNG (mulberry32) so every seed run is byte-for-byte deterministic -- no
// dependency on Math.random, which is intentionally unseedable. Every generator in seed/
// pulls randomness from one of these, threaded through explicitly rather than a shared global,
// so the *order* generators run in doesn't change what any individual one produces.
'use strict';

function makeRng(seed) {
  let a = seed >>> 0;
  function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    float: next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    bool: (pTrue) => next() < (pTrue === undefined ? 0.5 : pTrue),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    pickWeighted: (pairs) => {
      // pairs: [[value, weight], ...]
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [value, weight] of pairs) {
        r -= weight;
        if (r <= 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// Derives an independent RNG stream for one generator module from the base seed + a label
// (FNV-1a hash), not by consuming randomness from a shared parent. That's what keeps this
// order-independent: seed/generators/leave.js always gets the same stream whether it runs
// before or after seed/generators/payroll.js in seed.js's orchestration order.
function child(baseSeed, label) {
  let h = 2166136261 ^ baseSeed;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return makeRng(h >>> 0);
}

module.exports = { makeRng, child };
