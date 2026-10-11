// Creates users.json and challenges.json. Nothing secret is stored as plain text
// except the flags, which never leave the server until every answer for that stage is right.
// Edit the values below, then run:  npm run seed
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const N = require('../lib/normalize');
const { readExifFile } = require('../lib/exif');
const { setTextTags } = require('../lib/exif-write');

// Output and photo folders. The defaults are right for normal use; the overrides let tests
// build a throwaway copy without touching the real data.
const ROOT_DIR = path.join(__dirname, '..', '..');
const OUT_DIR = process.env.SEED_OUT || path.join(ROOT_DIR, 'data');
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || path.join(ROOT_DIR, 'data', 'evidence');

function field(type, answers, extra) {
  const salt = crypto.randomBytes(16).toString('hex');
  const clean = type === 'phone' ? N.phone : N.text;
  return Object.assign(
    { type, salt, hashes: answers.map((a) => N.hmac(salt, clean(a))) },
    extra ? extra(salt) : {}
  );
}

// ---------------- login ----------------
const USERS = [
  {
    username: 'X@@@GTHTH%%$KMJH',
    password: '!)!)!)!)!)SLIIT_%^%^$#^&*NKMT#@#',
  },
];

// ---------------- Exhibit A (OSINT) ----------------
// Every accepted spelling is listed. Text answers ignore case, spaces and punctuation,
// so "Wausan-ro 17-gil" also accepts "wausanro 17 gil". Phone answers ignore dashes and a +82 prefix.
const EXHIBIT_A = {
  flag: 'RP{KJKJKNHGMNAMJHJHJKAJKKLJKLAKHJKH}',
  city: ['Seoul', '서울'],
  street: ['Wausan-ro 17-gil', '와우산로17길'],
  phone: ['0507-1338-6304'],
  // Café name. Case, spaces, accents and punctuation are ignored, so "Café Gong-myeong" also matches.
  cafe: [
    'Cafe Gong Myoung, Hongdae Branch',
    'Cafe Gong Myoung',
    'Gong Myoung',
    'Gong Myoung, Hongdae Branch',
    'Cafe Gong Myoung Hongdae',
    '카페 공명',
    '공명',
    '카페 공명 홍대점',
    '공명 홍대점',
    'Cafe Gongmyeong',
    'Gongmyeong',
    'Cafe Gongmyeong Hongdae',
    'Gongmyeong Hongdae',
  ],
  // The video can be given as any YouTube link or the bare id, or as the exact title.
  videoId: '55rgsDxLyAU',
  videoTitles: [
    '아이돌이 바리스타가 되면 생기는 일 3̶1̶카피판 | 엔독스 설얘&배이 | K판 입덕투어 EP.10',
    'K판 입덕투어 EP.10',
  ],
};

// ---------------- Exhibit B (metadata forensics) ----------------
// The three questions players answer about the recovered photo:
//   Q1  What GPS location do the coordinates point to?
//   Q2  What is the file's last-modified date?
//   Q3  What phone model was used to take this photo?
//
// Your original photo stays in the evidence folder and is never changed. "npm run seed" makes the
// copy players download (evidence/recovered.jpg): the same picture and the same metadata, plus a
// last-modified date. That date is written into the photo's metadata, into the file's own
// modified time, and into the Last-Modified header the server sends with the download, so it
// reads the same however a player looks at it.
const EXHIBIT_B = {
  source: 'X45ghLL.jpg',            // your original photo, inside the evidence folder
  photo: 'recovered.jpg',           // the copy players download
  flag: 'RP{QPWOEIRUTYLKJHGFDSAMNB}',
  // Q1. Case, spaces and punctuation are ignored.
  location: [
    'Gangnam Station, Seoul',
    'Gangnam Station',
    'Gangnam Subway Station',
    'Gangnam Station, Seoul, South Korea',
    'Gangnam Station, South Korea',
    'Gangnam Stn',
    '강남역',
    '서울 강남역',
  ],
  // Q2. Day-first and month-first spellings both work, so 09/09/2026 is safe either way.
  modified: '2026-09-09',
  modifiedTime: '12:07:31',         // time of day stored with that date
  // Q3
  model: ['iPhone 14 Pro', 'Apple iPhone 14 Pro'],
};

function buildExhibitB() {
  const src = path.join(EVIDENCE_DIR, EXHIBIT_B.source);
  const dest = path.join(EVIDENCE_DIR, EXHIBIT_B.photo);
  const notReady = { ready: false, photo: EXHIBIT_B.photo, flag: EXHIBIT_B.flag };
  const stop = (why) => {
    console.log('Exhibit B is NOT ready: ' + why + '.');
    console.log('  Fix that and run "npm run seed" again. Players see "not ready yet" until then.');
    return notReady;
  };

  if (!fs.existsSync(src)) return stop('evidence/' + EXHIBIT_B.source + ' was not found');

  const stamp = EXHIBIT_B.modified + ' ' + EXHIBIT_B.modifiedTime;      // 2026-09-09 12:07:31
  const when = new Date(stamp.replace(' ', 'T') + 'Z');
  if (Number.isNaN(when.getTime())) return stop('the modified date "' + stamp + '" is not valid');

  try {
    fs.writeFileSync(dest, setTextTags(fs.readFileSync(src), { 0x0132: stamp.replace(/-/g, ':') }));
    fs.utimesSync(dest, when, when);
  } catch (e) {
    return stop('could not prepare ' + EXHIBIT_B.source + ': ' + e.message);
  }

  // Read the copy back, so what is printed here is exactly what players will find.
  const found = readExifFile(dest);
  console.log('Exhibit B ready. The photo players download holds:');
  if (found.gps) {
    console.log('  Q1 GPS position : ' + found.gps.lat.toFixed(6) + ', ' + found.gps.lon.toFixed(6));
    console.log('     check it on a map: https://www.google.com/maps?q=' + found.gps.lat.toFixed(6) + ',' + found.gps.lon.toFixed(6));
    console.log('     accepted answer: ' + EXHIBIT_B.location[0]);
  } else {
    console.log('  WARNING: the photo has no GPS position, so players cannot find Q1.');
  }
  console.log('  Q2 Modified date: ' + found.modified + '   (accepted answer: ' + EXHIBIT_B.modified + ')');
  if (found.model) {
    console.log('  Q3 Phone model  : ' + [found.make, found.model].filter(Boolean).join(' '));
    const ok = EXHIBIT_B.model.some((m) => N.text(m) === N.text(found.model) || N.text(m) === N.text((found.make || '') + ' ' + found.model));
    if (!ok) console.log('  WARNING: none of the accepted Q3 answers matches "' + found.model + '".');
  } else {
    console.log('  WARNING: the photo has no phone model, so players cannot find Q3.');
  }

  return {
    ready: true,
    photo: EXHIBIT_B.photo,
    flag: EXHIBIT_B.flag,
    modified: EXHIBIT_B.modified,
    lastModified: when.toISOString(),
    fields: {
      location: field('text', EXHIBIT_B.location),
      model: field('text', EXHIBIT_B.model),
    },
  };
}

// ---------------- Exhibit C (SQL injection + stored XSS) ----------------
// A real HR portal (see /hr-portal.html and lib/hrdb.js): a genuine in-memory SQLite database,
// built fresh from the seed below and queried with real, naively concatenated SQL. The bug is
// real; only the data behind it is fake.
const EXHIBIT_C = {
  flag: 'RP{ZXCVBNMASDFGHJKLQWERTYUIOPZX}',
  // The fake employee directory shown by a normal (non-injected) search.
  employees: [
    { name: 'R. Vaaranan', role: 'HR Portal Sysadmin' },
    { name: 'D. Kowalski', role: 'HR Manager' },
    { name: 'M. Chen', role: 'Recruiter' },
    { name: 'A. Silva', role: 'Payroll Officer' },
    { name: 'J. Osei', role: 'IT Support' },
  ],
  // Accounts seeded into the real hr_users table. Nobody is ever told these passwords \u2014 the
  // only way in is to break the login query, not to guess a credential.
  hrUsers: [
    { username: 'helpdesk', password: crypto.randomBytes(18).toString('base64'), role: 'HR Helpdesk' },
    { username: 'admin', password: crypto.randomBytes(18).toString('base64'), role: 'System Administrator' },
  ],
  // Sits in a real admin_notes table, only reachable with a genuine UNION injection that
  // matches the search query's column count.
  noteText:
    "Reminder to HR staff: the temporary admin fallback account is still active pending the Q3 " +
    'security audit. Emergency override code is BLACKOUT-7 \u2014 do not share this outside IT.\n' +
    '\u2014 Vaaranan, HR Portal Sysadmin',
  // The one fact players pull out of that note and type back.
  code: ['BLACKOUT-7', 'BLACKOUT7', 'BLACKOUT 7'],
  // A low-stakes "reach the staging portal" code, mentioned directly in the case file once
  // Stage 3 opens. It gates nothing security-sensitive by itself \u2014 Stage 3 must still be
  // unlocked server-side before the portal accepts any real login or search attempt.
  portalAccessCode: 'SDX-VPN-8841',
};

// ---------------- Exhibit D (XXE + IDOR) ----------------
const EXHIBIT_D = {
  flag: 'RP{MNBVCXZLKJHGFDSAPOIUYTREWQASD}',
  // Returned only when the bulk-import XML declares and references an external entity that
  // resolves (for real, see lib/xxe.js) to this file inside the portal's sandboxed filesystem.
  leakedConfig:
    '# solstice-dynamics internal config (RESTRICTED)\n' +
    '# maintained by: vaaranan\n' +
    'service: hr-portal-import\n' +
    'backup_passphrase: violet-harbor-42\n' +
    'note: rotate this after every audit cycle\n',
  // A generic decoy target so the standard "read /etc/passwd" XXE test also proves the bug is
  // real, without handing over anything the flag depends on.
  decoyPasswd: 'root:x:0:0:root:/root:/bin/bash\nhr-svc:x:1001:1001::/home/hr-svc:/usr/sbin/nologin\n',
  passphrase: ['violet-harbor-42', 'violet harbor 42', 'violetharbor42'],
  // A small fixed payslip directory. Nothing checks whether the id belongs to the requester.
  payslips: {
    1007: { id: 1007, name: 'Inchaf', role: 'Payroll Clerk, Finance', years: 10, debt: '$18,400 owed to Solstice Credit Union' },
    1003: { id: 1003, name: 'B. Farrow', role: 'Warehouse Lead', years: 4, debt: 'No outstanding balance' },
    1005: { id: 1005, name: 'T. Nakamura', role: 'Sales Associate', years: 2, debt: 'No outstanding balance' },
    1010: { id: 1010, name: 'S. Okafor', role: 'Office Admin', years: 6, debt: '$1,200 owed to Solstice Credit Union' },
  },
  debt: ['$18,400', '18,400', '18400'],
};

// ---------------- Exhibit E (Apache log analysis) ----------------
const EXHIBIT_E = {
  flag: 'RP{LKJHGFDSAPOIUYTREWQMNBVCXZQAZ}',
  attackerIp: '203.0.113.66',
  // Hidden inside one User-Agent string in access.log.
  uaFlag: 'RP{GH0ST_LEFT_A_MARK_IN_THE_UA}',
};

function pad(n) { return String(n).padStart(2, '0'); }
const MONTHS_3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildExhibitE() {
  const day = 9, month = 9, year = 2026; // the same morning as the breach in Exhibit B
  const apacheTime = (h, m, s) => `${pad(day)}/${MONTHS_3[month - 1]}/${year}:${pad(h)}:${pad(m)}:${pad(s)} +0000`;
  const errTime = (h, m, s) => `Wed ${MONTHS_3[month - 1]} ${pad(day)} ${pad(h)}:${pad(m)}:${pad(s)} ${year}`;
  const ip = EXHIBIT_E.attackerIp;
  const normal = ['198.51.100.23', '192.0.2.14', '198.51.100.87', '192.0.2.201', '203.0.113.9'];
  const ua = (extra) =>
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36' + (extra ? ' ' + extra : '');

  const rowsAccess = [
    [normal[0], apacheTime(7, 36, 2), 'GET', '/index.html', 200, 4021, ua()],
    [normal[1], apacheTime(7, 36, 40), 'GET', '/assets/logo.png', 200, 8834, ua()],
    [normal[2], apacheTime(7, 37, 11), 'GET', '/careers.html', 200, 3312, ua()],
    [ip, apacheTime(7, 41, 2), 'GET', '/login', 200, 2214, ua()],
    [normal[3], apacheTime(7, 41, 30), 'GET', '/about.html', 200, 2870, ua()],
    [ip, apacheTime(7, 42, 10), 'POST', '/login', 200, 512, ua()],
    [ip, apacheTime(7, 43, 55), 'GET', "/search?q=%27%20UNION%20SELECT%20note%20FROM%20admin_notes--%20", 200, 1188, ua()],
    [normal[0], apacheTime(7, 45, 8), 'GET', '/index.html', 200, 4021, ua()],
    [ip, apacheTime(7, 47, 20), 'POST', '/feedback', 200, 331, ua()],
    [ip, apacheTime(7, 52, 3), 'POST', '/import', 200, 902, ua()],
    [normal[4], apacheTime(7, 53, 47), 'GET', '/careers.html', 200, 3312, ua()],
    [ip, apacheTime(7, 55, 11), 'GET', '/payslip?id=1001', 404, 210, ua()],
    [ip, apacheTime(7, 55, 19), 'GET', '/payslip?id=1003', 200, 640, ua()],
    [ip, apacheTime(7, 55, 27), 'GET', '/payslip?id=1005', 200, 640, ua()],
    [ip, apacheTime(7, 55, 34), 'GET', '/payslip?id=1007', 200, 655, ua()],
    [ip, apacheTime(7, 55, 42), 'GET', '/payslip?id=1010', 200, 640, ua()],
    [normal[1], apacheTime(7, 56, 0), 'GET', '/assets/logo.png', 200, 8834, ua()],
    [ip, apacheTime(7, 56, 10), 'GET', '/logout', 200, 198, ua('X-GF/1.0 ' + EXHIBIT_E.uaFlag)],
  ];
  const access = rowsAccess
    .map(([a, t, method, pth, status, size, agent]) => `${a} - - [${t}] "${method} ${pth} HTTP/1.1" ${status} ${size} "-" "${agent}"`)
    .join('\n') + '\n';

  const errorLines = [
    `[${errTime(7, 42, 11)}] [warn] [client ${ip}] app: SQL injection pattern detected in POST /login (rule 981245)`,
    `[${errTime(7, 44, 2)}] [warn] [client ${ip}] app: UNION SELECT detected in GET /search query string`,
    `[${errTime(7, 47, 25)}] [warn] [client ${ip}] app: feedback message flagged for review (contains an event-handler attribute)`,
    `[${errTime(7, 52, 8)}] [warn] [client ${ip}] app: XML import declared an external entity (SYSTEM) — request rejected by policy, but the importer ran it anyway`,
    `[${errTime(7, 55, 45)}] [warn] [client ${ip}] app: five payslip lookups for five different ids in under a minute — possible IDOR probing`,
    `[${errTime(6, 58, 3)}] [notice] [client ${normal[2]}] app: scheduled cache warm-up complete`,
  ];
  const error = errorLines.join('\n') + '\n';

  fs.writeFileSync(path.join(EVIDENCE_DIR, 'access.log'), access);
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'error.log'), error);
  console.log('Exhibit E ready. evidence/access.log and evidence/error.log written.');
  console.log('  Attacker IP : ' + ip);
  console.log('  UA flag     : ' + EXHIBIT_E.uaFlag);

  return {
    ready: true,
    flag: EXHIBIT_E.flag,
    uaFlag: EXHIBIT_E.uaFlag,
    fields: { attackerIp: field('text', [EXHIBIT_E.attackerIp]) },
  };
}

// ---------------- Exhibit F (thumbnail cache + Prefetch) ----------------
const EXHIBIT_F = {
  flag: 'RP{CASE_CLOSED_GHOSTFEN_SOLSTICE}',
  thumbFlag: 'RP{CACHE_NEVER_FORGETS_A_PHOTO}',
  program: ['SQLMAP.EXE', 'SQLMAP', 'sqlmap.exe', 'sqlmap'],
  lastRun: '2026-09-19 23:47:12',
};

function buildExhibitF() {
  const cacheRows = [
    ['0x0001', '1024B', 'OK', 'C:\\Users\\arshb\\Pictures\\Screenshots\\shot1.png'],
    ['0x0002', '1024B', 'OK', 'C:\\Users\\arshb\\Downloads\\invoice_solstice.pdf'],
    ['0x0003', '1024B', 'OK', 'C:\\Users\\arshb\\Pictures\\profile.jpg'],
    ['0x0004', '1024B', 'OK', 'C:\\Users\\arshb\\Downloads\\resume_2025.docx'],
    ['0x0005', '1024B', 'OK', 'C:\\Users\\arshb\\Pictures\\Screenshots\\shot2.png'],
    ['0x0006', '1024B', 'OK', 'C:\\Users\\arshb\\Downloads\\sqlmap-1.7.2\\readme.txt'],
    ['0x0007', '1024B', 'OK', 'C:\\Users\\arshb\\Pictures\\vacation.jpg'],
    ['0x0008', '1024B', 'OK', 'C:\\Users\\arshb\\Downloads\\wordlist.txt'],
    ['0x0009', '1024B', 'OK', 'C:\\Users\\arshb\\Pictures\\Screenshots\\shot3.png'],
    ['0x000A', '1024B', 'OK', 'C:\\Users\\arshb\\Downloads\\payload.xml'],
    ['0x000B', '1024B', 'OK', 'C:\\Users\\arshb\\Pictures\\logo_draft.png'],
  ];
  const cacheBody = cacheRows.map(([id, size, status, file]) => `${id}   ${size}   ${status.padEnd(9)}  ${file}`).join('\n');
  const orphan =
    '0x000C   1024B   ORPHANED   (no matching file on disk)\n' +
    '   recovered EXIF comment : ' + EXHIBIT_F.thumbFlag + '\n' +
    '   original filename (partial) : IMG_20260801_...jpg\n';
  const thumbcache =
    'THUMBNAIL CACHE INDEX \u2014 thumbcache_1024.db (recovered)\n' +
    '--------------------------------------------------------\n' +
    'ID       SIZE    STATUS     SOURCE FILE\n' +
    cacheBody + '\n' + orphan;

  const prefRows = [
    ['EXPLORER.EXE', 203, '2026-09-20 08:14:02'],
    ['SQLMAP.EXE', 68, EXHIBIT_F.lastRun],
    ['CHROME.EXE', 55, '2026-09-18 19:02:44'],
    ['PYTHON.EXE', 41, '2026-09-19 23:44:51'],
    ['CMD.EXE', 29, '2026-09-19 23:40:05'],
    ['NOTEPAD++.EXE', 31, '2026-09-10 14:12:00'],
    ['7Z.EXE', 9, '2026-09-05 11:00:00'],
    ['MSPAINT.EXE', 6, '2026-08-30 09:12:10'],
    ['CALC.EXE', 3, '2026-08-22 17:05:44'],
  ];
  const prefBody = prefRows
    .slice()
    .sort((a, b) => b[1] - a[1])
    .map(([name, count, last]) => `${name.padEnd(16)} ${String(count).padStart(6)}      ${last}`)
    .join('\n');
  const prefetch =
    'PREFETCH ANALYSIS \u2014 C:\\Windows\\Prefetch (exported)\n' +
    'EXECUTABLE        RUN COUNT   LAST RUN (UTC)\n' +
    prefBody + '\n';

  fs.writeFileSync(path.join(EVIDENCE_DIR, 'thumbcache.txt'), thumbcache);
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'prefetch.txt'), prefetch);
  console.log('Exhibit F ready. evidence/thumbcache.txt and evidence/prefetch.txt written.');
  console.log('  Thumbnail flag : ' + EXHIBIT_F.thumbFlag);
  console.log('  2nd most used  : ' + EXHIBIT_F.program[0] + ' @ ' + EXHIBIT_F.lastRun);

  return {
    ready: true,
    flag: EXHIBIT_F.flag,
    thumbFlag: EXHIBIT_F.thumbFlag,
    lastRun: EXHIBIT_F.lastRun,
    fields: { program: field('text', EXHIBIT_F.program) },
  };
}

// ---------------------------------------------------------------------

const users = USERS.map((u) => {
  // Same cleaning the server applies to what people type, so both sides always agree.
  const username = N.credential(u.username);
  const password = N.credential(u.password);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { username, salt, hash };
});

const challenges = {
  exhibitA: {
    flag: EXHIBIT_A.flag,
    fields: {
      city: field('text', EXHIBIT_A.city),
      street: field('text', EXHIBIT_A.street),
      cafe: field('text', EXHIBIT_A.cafe),
      phone: field('phone', EXHIBIT_A.phone),
      video: field('video', EXHIBIT_A.videoTitles, (salt) => ({
        idHash: N.hmac(salt, EXHIBIT_A.videoId),
      })),
    },
  },
  exhibitB: buildExhibitB(),
  exhibitC: {
    flag: EXHIBIT_C.flag,
    employees: EXHIBIT_C.employees,
    hrUsers: EXHIBIT_C.hrUsers,
    noteText: EXHIBIT_C.noteText,
    portalAccessCode: EXHIBIT_C.portalAccessCode,
    fields: { code: field('text', EXHIBIT_C.code) },
  },
  exhibitD: {
    flag: EXHIBIT_D.flag,
    leakedConfig: EXHIBIT_D.leakedConfig,
    decoyPasswd: EXHIBIT_D.decoyPasswd,
    payslips: EXHIBIT_D.payslips,
    fields: {
      passphrase: field('text', EXHIBIT_D.passphrase),
      debt: field('text', EXHIBIT_D.debt),
    },
  },
  exhibitE: buildExhibitE(),
  exhibitF: buildExhibitF(),
};

fs.writeFileSync(path.join(OUT_DIR, 'users.json'), JSON.stringify({ users }, null, 2) + '\n');
fs.writeFileSync(path.join(OUT_DIR, 'challenges.json'), JSON.stringify(challenges, null, 2) + '\n');
console.log('users.json written with ' + users.length + ' user(s).');
console.log('challenges.json written for Exhibits A through F.');
