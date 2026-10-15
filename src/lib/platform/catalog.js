'use strict';
// The scored challenges. Each row names the existing server-side check that has to pass before
// points are awarded; the platform never accepts a score or a completion from a client.
// Challenges unlock strictly in this order, matching the story progression in server.js.

const CHALLENGES = [
  { key: 'entry', stage: 0, name: 'Entry Gate', points: 50, ref: 'POST /api/login',
    summary: 'Recover the hidden access credentials and open the case.' },
  { key: 'exhibit_a', stage: 1, name: 'Exhibit A', points: 100, ref: 'POST /api/exhibit-a',
    summary: 'Where in the world was this photographed?' },
  { key: 'exhibit_b', stage: 2, name: 'Exhibit B', points: 150, ref: 'POST /api/exhibit-b',
    summary: 'Read what the photo file itself reveals.' },
  { key: 'exhibit_c', stage: 3, name: 'Exhibit C', points: 300, ref: 'POST /api/exhibit-c',
    summary: 'Break into the staging portal and find the way out.' },
  { key: 'exhibit_d', stage: 4, name: 'Exhibit D', points: 250, ref: 'POST /api/exhibit-d',
    summary: 'Follow the records back to whoever holds the ledger.' },
  { key: 'exhibit_e', stage: 5, name: 'Exhibit E', points: 250, ref: 'POST /api/exhibit-e',
    summary: 'Find the attacker in the server logs.' },
  { key: 'exhibit_f', stage: 6, name: 'Exhibit F', points: 300, ref: 'POST /api/exhibit-f',
    summary: 'Reconstruct what ran on the disk.' },
];

const KEYS = CHALLENGES.map((c) => c.key);
const EXHIBIT_KEYS = KEYS.filter((k) => k !== 'entry');
const TOTAL_POINTS = CHALLENGES.reduce((sum, c) => sum + c.points, 0);

// Where a player lands after `lock` consecutive exhibits are complete (0 = none yet).
const NEXT_PAGE = [
  '/stage2.html',
  '/exhibit-b.html?intro=1',
  '/exhibit-c.html?intro=1',
  '/exhibit-d.html?intro=1',
  '/exhibit-dhalf.html?intro=1',
  '/exhibit-f.html?intro=1',
  '/epilogue.html?intro=1',
];

module.exports = { CHALLENGES, KEYS, EXHIBIT_KEYS, TOTAL_POINTS, NEXT_PAGE };
