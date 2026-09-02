/* BCDA scoring engine.
 *
 * Single source of truth for parsing DartConnect exports and computing All Stars.
 * Imported unchanged by the browser (admin preview) and by the Netlify Function
 * that writes the published board, so a preview can never disagree with what ships.
 */

/* ---------------------------------------------------------------- All Stars */

export const CRICKET_WEIGHTS = Object.freeze({
  m6: 1, m7: 2, m8: 3, m9: 4,   // 6/7/8/9 mark turns
  b3: 1, b4: 2, b5: 3, b6: 4,   // 3/4/5/6 cork turns
});

export const X01_WEIGHTS = Object.freeze({
  b100_139: 1,
  b140_179: 2,
  b180: 4,
});

/* ------------------------------------------------------------- CSV parsing */

/** RFC4180-ish parser: handles quoted fields, embedded commas, doubled quotes, CRLF. */
export function parseCSV(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** Turn a CSV string into { headers, rows } where each row is a header-keyed object. */
export function toRecords(text) {
  const grid = parseCSV(text);
  if (!grid.length) return { headers: [], rows: [] };
  const headers = grid[0].map((h) => String(h).trim());
  const rows = grid.slice(1).map((cells) => {
    const rec = {};
    headers.forEach((h, i) => { rec[h] = cells[i] ?? ''; });
    return rec;
  });
  return { headers, rows };
}

/* ------------------------------------------------------------ field access */

/** Case/space-insensitive column read. */
function col(rec, ...names) {
  if (!rec) return '';
  for (const name of names) {
    if (rec[name] !== undefined) return rec[name];
  }
  const want = names.map((n) => n.toLowerCase().replace(/\s+/g, ''));
  for (const key of Object.keys(rec)) {
    if (want.includes(key.toLowerCase().replace(/\s+/g, ''))) return rec[key];
  }
  return '';
}

/** Number, or null when the cell is genuinely blank. Blank is never zero. */
export function num(value) {
  const s = String(value ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Number for scoring purposes, where a blank count means none were thrown. */
function count(value) {
  const n = num(value);
  return n === null ? 0 : Math.round(n);
}

/* --------------------------------------------------------- file identity */

const CRICKET_SIGNATURE = ['MPR', 'Marks Scored'];
const X01_SIGNATURE = ['3DA', 'Points Scored'];

function hasAll(headers, needed) {
  const flat = headers.map((h) => h.toLowerCase().replace(/\s+/g, ''));
  return needed.every((n) => flat.includes(n.toLowerCase().replace(/\s+/g, '')));
}

/** 'cricket' | 'x01' | null — decided by header signature, not by filename. */
export function detectKind(headers) {
  if (hasAll(headers, CRICKET_SIGNATURE)) return 'cricket';
  if (hasAll(headers, X01_SIGNATURE)) return 'x01';
  return null;
}

/* ------------------------------------------------------------- divisions */

const LEAGUES = [
  [/single/i, 'Singles'],
  [/double/i, 'Doubles'],
  [/team/i, 'Teams'],
];

/**
 * "A Division - Singles" -> { division: 'A', league: 'Singles' }
 * Tolerates the "B Divison" typo present in the real exports.
 */
export function parseDivision(raw) {
  const s = String(raw ?? '').trim();
  const parts = s.split(/\s*[-–—]\s*/);
  const left = parts[0] ?? '';
  const right = parts.slice(1).join(' - ').trim();

  const letter = left.match(/\b([A-Za-z])\b/) || left.match(/^\s*([A-Za-z])/);
  const division = letter ? letter[1].toUpperCase() : '';

  let league = '';
  for (const [re, name] of LEAGUES) {
    if (re.test(right) || (!right && re.test(s))) { league = name; break; }
  }
  return { division, league: league || right, raw: s };
}

const TEAM_HEADERS = ['team', 'teamname', 'team name', 'teams'];

function readTeam(rec) {
  if (!rec) return '';
  for (const key of Object.keys(rec)) {
    if (TEAM_HEADERS.includes(key.trim().toLowerCase())) {
      const v = String(rec[key] ?? '').trim();
      if (v) return v;
    }
  }
  return '';
}

/* --------------------------------------------------------------- scoring */

export function cricketAllStars(p) {
  const w = CRICKET_WEIGHTS;
  return p.m6 * w.m6 + p.m7 * w.m7 + p.m8 * w.m8 + p.m9 * w.m9
       + p.b3 * w.b3 + p.b4 * w.b4 + p.b5 * w.b5 + p.b6 * w.b6;
}

export function x01AllStars(p) {
  const w = X01_WEIGHTS;
  return p.b100_139 * w.b100_139 + p.b140_179 * w.b140_179 + p.b180 * w.b180;
}

/**
 * Resolve the three scoring bands from an '01 row.
 *
 * DartConnect ships `100+` and `140+` as cumulative totals, so they cannot be
 * scored directly against a rule written in ranges. Where the export also carries
 * its per-band columns we read those straight off — exact, and immune to whether
 * a given export happens to be cumulative. Otherwise we derive by subtraction.
 */
export function x01Bands(rec) {
  const raw100 = count(col(rec, '100+'));
  const raw140 = count(col(rec, '140+'));
  const b180 = count(col(rec, '180'));

  const low1 = num(col(rec, 'T00_19', 'T100_119'));
  const low2 = num(col(rec, 'T20_39', 'T120_139'));
  const high1 = num(col(rec, 'T40_59', 'T140_159'));
  const high2 = num(col(rec, 'T60_79', 'T160_179'));
  const haveBands = [low1, low2, high1, high2].every((v) => v !== null);

  if (haveBands) {
    const bands = {
      b100_139: low1 + low2,
      b140_179: high1 + high2,
      b180,
      raw100,
      raw140,
      mode: 'bands',
    };
    // Cross-check: does the export agree that 100+ is cumulative?
    bands.cumulative = (bands.b100_139 + bands.b140_179 + b180) === raw100;
    return bands;
  }

  return {
    b100_139: Math.max(0, raw100 - raw140),
    b140_179: Math.max(0, raw140 - b180),
    b180,
    raw100,
    raw140,
    mode: 'derived',
    cumulative: true,
  };
}

/* ----------------------------------------------------------------- board */

const keyOf = (last, first, division) =>
  [last, first, division].map((s) => String(s ?? '').trim().toLowerCase()).join('|');

const titleCase = (s) => String(s ?? '').trim();

/**
 * Merge a cricket export and an '01 export into one board.
 * @returns {{players:Array, warnings:Array, meta:Object}}
 */
export function buildBoard({ cricketCsv = '', x01Csv = '', roster = {} } = {}) {
  const warnings = [];
  const cricket = cricketCsv ? toRecords(cricketCsv) : { headers: [], rows: [] };
  const x01 = x01Csv ? toRecords(x01Csv) : { headers: [], rows: [] };

  const byKey = new Map();
  const leagues = new Set();
  const divisions = new Set();
  let bandMode = null;
  let cumulativeSeen = null;

  const shell = (rec) => {
    const last = titleCase(col(rec, 'Last'));
    const first = titleCase(col(rec, 'First'));
    const { division, league } = parseDivision(col(rec, 'Division'));
    const k = keyOf(last, first, division);
    if (division) divisions.add(division);
    if (league) leagues.add(league);

    let p = byKey.get(k);
    if (!p) {
      p = {
        key: k, last, first, division, league,
        gender: '', team: '',
        m6: 0, m7: 0, m8: 0, m9: 0, b3: 0, b4: 0, b5: 0, b6: 0,
        mpr: null, tda: null, hdi: null, hdo: null,
        b100_139: 0, b140_179: 0, b180: 0, raw100: 0, raw140: 0,
        cricketAS: 0, x01AS: 0, totalAS: 0,
        matches: null, legs: null,
        inCricket: false, inX01: false,
      };
      byKey.set(k, p);
    }
    const g = String(col(rec, 'Gender') ?? '').trim().toUpperCase();
    if (g && !p.gender) p.gender = g;
    const t = readTeam(rec);
    if (t && !p.team) p.team = t;
    return p;
  };

  for (const rec of cricket.rows) {
    if (!String(col(rec, 'Last')).trim()) continue;
    const p = shell(rec);
    p.inCricket = true;
    p.m6 = count(col(rec, '6M'));
    p.m7 = count(col(rec, '7M'));
    p.m8 = count(col(rec, '8M'));
    p.m9 = count(col(rec, '9M'));
    p.b3 = count(col(rec, '3B'));
    p.b4 = count(col(rec, '4B'));
    p.b5 = count(col(rec, '5B'));
    p.b6 = count(col(rec, '6B'));
    p.mpr = num(col(rec, 'MPR'));
    p.matches = num(col(rec, 'Matches'));
  }

  for (const rec of x01.rows) {
    if (!String(col(rec, 'Last')).trim()) continue;
    const p = shell(rec);
    p.inX01 = true;
    const bands = x01Bands(rec);
    p.b100_139 = bands.b100_139;
    p.b140_179 = bands.b140_179;
    p.b180 = bands.b180;
    p.raw100 = bands.raw100;
    p.raw140 = bands.raw140;
    p.hdi = num(col(rec, 'HDI'));
    p.hdo = num(col(rec, 'HDO'));
    p.tda = num(col(rec, '3DA'));
    if (p.matches === null) p.matches = num(col(rec, 'Matches'));
    if (bandMode === null) bandMode = bands.mode;
    else if (bandMode !== bands.mode) bandMode = 'mixed';
    if (bands.cumulative === false) cumulativeSeen = false;
    else if (cumulativeSeen === null) cumulativeSeen = true;
  }

  const players = [...byKey.values()];

  for (const p of players) {
    const override = roster[p.key];
    if (override) {
      if (override.gender) p.gender = String(override.gender).toUpperCase();
      if (override.team) p.team = override.team;
    }
    p.cricketAS = cricketAllStars(p);
    p.x01AS = x01AllStars(p);
    p.totalAS = p.cricketAS + p.x01AS;
    p.name = `${p.first} ${p.last}`.trim();
  }

  /* ------- warnings the admin sees before publishing, never silent ------- */

  for (const p of players) {
    if (!p.gender) {
      warnings.push({ level: 'warn', player: p.name, key: p.key,
        message: `No gender in the export — set it in the roster or ${p.name} is left out of the High In / High Out tiles.` });
    }
    if (p.inCricket && !p.inX01) {
      warnings.push({ level: 'warn', player: p.name, key: p.key,
        message: `Appears in the cricket file but not the '01 file — scoring '01 as zero.` });
    }
    if (p.inX01 && !p.inCricket) {
      warnings.push({ level: 'warn', player: p.name, key: p.key,
        message: `Appears in the '01 file but not the cricket file — scoring cricket as zero.` });
    }
  }
  if (leagues.size > 1) {
    warnings.push({ level: 'warn', message: `These files span more than one league: ${[...leagues].join(', ')}.` });
  }
  if (cumulativeSeen === false) {
    warnings.push({ level: 'info', message: `This export lists 100+ and 140+ as exclusive ranges rather than cumulative totals. Scored from the per-band columns, so the totals are correct either way.` });
  }

  players.sort(defaultOrder);

  return {
    players,
    warnings,
    meta: {
      league: leagues.size === 1 ? [...leagues][0] : [...leagues].join(' + '),
      leagues: [...leagues],
      divisions: [...divisions].sort(),
      bandMode: bandMode ?? 'none',
      cumulative: cumulativeSeen,
      cricketRows: cricket.rows.length,
      x01Rows: x01.rows.length,
      players: players.length,
    },
  };
}

/** Sheet order: women first, then men, each descending by Total AS. */
export function defaultOrder(a, b) {
  const rank = (g) => (g === 'F' ? 0 : g === 'M' ? 1 : 2);
  return rank(a.gender) - rank(b.gender)
      || b.totalAS - a.totalAS
      || a.last.localeCompare(b.last);
}

/* --------------------------------------------------------------- records */

/** Highest in and highest out per gender. Blank values are excluded, not zeroed. */
export function computeRecords(players) {
  const out = {};
  for (const gender of ['F', 'M']) {
    const pool = players.filter((p) => p.gender === gender);
    const best = (field) => {
      const eligible = pool.filter((p) => typeof p[field] === 'number' && p[field] > 0);
      if (!eligible.length) return null;
      return eligible.reduce((a, b) => (b[field] > a[field] ? b : a));
    };
    const hi = best('hdi');
    const ho = best('hdo');
    out[gender] = {
      in: hi ? { name: hi.name, value: hi.hdi, team: hi.team } : null,
      out: ho ? { name: ho.name, value: ho.hdo, team: ho.team } : null,
    };
  }
  return out;
}
