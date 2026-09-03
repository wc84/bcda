import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
  parseCSV, toRecords, detectKind, parseDivision, num,
  cricketAllStars, x01Bands, x01AllStars, buildBoard, computeRecords,
} from '../public/assets/engine.mjs';

/* ------------------------------------------------------------------------
 * Fixture: every row of the "Doubles A All Stars 2026" sheet currently in use.
 * If a change to the engine cannot reproduce this board, the change is wrong.
 * ---------------------------------------------------------------------- */
const DOUBLES_A = [
  // name,                 6M 7M 8M 9M  3B 4B 5B 6B  hdi   hdo   crAS
  ['Trish Boud',            3, 1, 0, 0,  4, 0, 0, 1,   41,   16,   13],
  ['Ally Heventhal',        2, 0, 0, 0,  0, 0, 0, 0,   10,   32,    2],
  ['Bob Curtis',            1, 1, 0, 0,  2, 2, 0, 0,   45,   41,    9],
  ['Larry Holland',         0, 0, 0, 1,  0, 0, 0, 0, null,  124,    4],
  ['Jeff Raschdorf',        1, 1, 0, 0,  1, 0, 0, 0,  160,   40,    4],
  ['Mike Marchessault',     0, 2, 0, 0,  1, 1, 0, 0,   37,  104,    7],
  ['Mike Powers',           2, 0, 0, 0,  1, 1, 0, 0, null,   20,    5],
  ['Chris Perry',           1, 1, 0, 0,  1, 0, 0, 0,   40,   56,    4],
  ['Joey Curtis',           2, 1, 0, 0,  0, 0, 0, 0,   40,   57,    4],
  ['DJ Randolph',           0, 0, 0, 0,  1, 0, 0, 0,   30,   64,    1],
  ['John Perry',            1, 1, 0, 0,  0, 0, 0, 0,   40,    4,    3],
  ['Ryan Merritt',          0, 1, 0, 0,  1, 0, 0, 0,   13, null,    3],
];

test('cricket All Stars reproduces every row of the Doubles A sheet', () => {
  for (const [name, m6, m7, m8, m9, b3, b4, b5, b6, , , expected] of DOUBLES_A) {
    const got = cricketAllStars({ m6, m7, m8, m9, b3, b4, b5, b6 });
    assert.equal(got, expected, `${name}: expected ${expected} cricket AS, got ${got}`);
  }
});

test('cricket weights ignore 5-mark turns', () => {
  const base = { m6: 0, m7: 0, m8: 0, m9: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
  assert.equal(cricketAllStars({ ...base, m5: 99 }), 0);
  assert.equal(cricketAllStars({ ...base, m9: 1 }), 4);
  assert.equal(cricketAllStars({ ...base, b6: 1 }), 4);
});

test("'01 All Stars applies 1 / 2 / 4 to the three ranges", () => {
  assert.equal(x01AllStars({ b100_139: 5, b140_179: 2, b180: 1 }), 5 + 4 + 4);
  assert.equal(x01AllStars({ b100_139: 0, b140_179: 0, b180: 0 }), 0);
});

/* ------------------------------------------------------------------------
 * Band resolution
 * ---------------------------------------------------------------------- */

test('bands are read directly from the per-band columns when present', () => {
  // Bear Nance, verified against the real Singles export.
  const rec = {
    '100+': '126', '140+': '31', '180': '2',
    T00_19: '65', T20_39: '30', T40_59: '26', T60_79: '3',
  };
  const b = x01Bands(rec);
  assert.equal(b.mode, 'bands');
  assert.equal(b.cumulative, true);
  assert.deepEqual([b.b100_139, b.b140_179, b.b180], [95, 29, 2]);
  assert.equal(x01AllStars(b), 95 + 58 + 8);
});

test('bands fall back to subtraction when the per-band columns are absent', () => {
  const b = x01Bands({ '100+': '126', '140+': '31', '180': '2' });
  assert.equal(b.mode, 'derived');
  assert.deepEqual([b.b100_139, b.b140_179, b.b180], [95, 29, 2]);
});

test('an export with exclusive 100+/140+ still scores correctly from its bands', () => {
  // Same thrower, but a file whose 100+ column means only 100-139.
  const rec = {
    '100+': '95', '140+': '29', '180': '2',
    T00_19: '65', T20_39: '30', T40_59: '26', T60_79: '3',
  };
  const b = x01Bands(rec);
  assert.equal(b.cumulative, false, 'should notice the columns are not cumulative');
  assert.deepEqual([b.b100_139, b.b140_179, b.b180], [95, 29, 2]);
});

/* ------------------------------------------------------------------------
 * Parsing
 * ---------------------------------------------------------------------- */

test('CSV parser handles quoted fields and embedded commas', () => {
  const rows = parseCSV('Last,First,Team\n"O\'Brien, Jr.",Sam,"Straight Trippin, A"\n');
  assert.deepEqual(rows[1], ["O'Brien, Jr.", 'Sam', 'Straight Trippin, A']);
});

test('CSV parser survives CRLF and a UTF-8 BOM', () => {
  const { headers, rows } = toRecords('\uFEFFLast,First\r\nNance,Bear\r\n');
  assert.deepEqual(headers, ['Last', 'First']);
  assert.equal(rows[0].Last, 'Nance');
});

test('file kind comes from the header signature, not the filename', () => {
  assert.equal(detectKind(['Last', 'Marks Scored', 'MPR', '6M']), 'cricket');
  assert.equal(detectKind(['Last', 'Points Scored', '3DA', '180']), 'x01');
  assert.equal(detectKind(['Last', 'First', 'Country']), null);
});

test('division parsing tolerates the "Divison" typo in the real export', () => {
  assert.deepEqual(parseDivision('A Division - Singles'), { division: 'A', league: 'Singles', raw: 'A Division - Singles' });
  assert.deepEqual(parseDivision('B Divison - Singles'), { division: 'B', league: 'Singles', raw: 'B Divison - Singles' });
  assert.equal(parseDivision('A Division - Doubles').league, 'Doubles');
  assert.equal(parseDivision('B Division - Teams').league, 'Teams');
});

test('a team column is picked up whatever its casing', () => {
  const board = buildBoard({
    cricketCsv: 'Last,First,Gender,Division,Team,Matches,Marks Scored,MPR,6M,7M,8M,9M,3B,4B,5B,6B\n'
              + 'Boud,Trish,F,A Division - Doubles,Straight Trippin,10,500,2.1,3,1,0,0,4,0,0,1\n',
  });
  assert.equal(board.players[0].team, 'Straight Trippin');
  assert.equal(board.players[0].league, 'Doubles');
  assert.equal(board.players[0].cricketAS, 13);
});

/* ------------------------------------------------------------------------
 * Blanks, joins and records
 * ---------------------------------------------------------------------- */

test('a blank high-in is excluded from the record, not treated as zero', () => {
  const players = DOUBLES_A.map(([name, m6, m7, m8, m9, b3, b4, b5, b6, hdi, hdo]) => ({
    name,
    gender: ['Trish Boud', 'Ally Heventhal'].includes(name) ? 'F' : 'M',
    hdi, hdo, team: '',
  }));
  const rec = computeRecords(players);
  assert.equal(rec.F.in.name, 'Trish Boud');
  assert.equal(rec.F.in.value, 41, 'the sheet prints 16 here, which is her high OUT');
  assert.equal(rec.F.out.name, 'Ally Heventhal');
  assert.equal(rec.F.out.value, 32);
  assert.equal(rec.M.in.name, 'Jeff Raschdorf');
  assert.equal(rec.M.in.value, 160);
  assert.equal(rec.M.out.name, 'Larry Holland');
  assert.equal(rec.M.out.value, 124, 'Larry has no HDI at all and must still win high out');
});

test('a player missing from one file is warned about, never silently zeroed', () => {
  const board = buildBoard({
    cricketCsv: 'Last,First,Gender,Division,Matches,Marks Scored,MPR,6M,7M,8M,9M,3B,4B,5B,6B\n'
              + 'Nance,Bear,M,A Division - Singles,16,3923,2.75,26,34,0,5,28,2,1,0\n',
    x01Csv: 'Last,First,Gender,Division,Matches,Points Scored,3DA,HDI,HDO,100+,140+,180\n'
          + 'Zebrowski,Chuck,M,A Division - Singles,16,68265,48.73,170,112,112,26,2\n',
  });
  const messages = board.warnings.map((w) => w.message).join(' | ');
  assert.match(messages, /Bear Nance|cricket file but not/);
  assert.equal(board.warnings.filter((w) => w.level === 'warn').length, 2);
});

test('a missing gender is reported rather than guessed', () => {
  const board = buildBoard({
    x01Csv: 'Last,First,Gender,Division,Points Scored,3DA,HDI,HDO,100+,140+,180\n'
          + 'Baum,Aspen,,B Divison - Singles,46203,32.61,105,90,25,2,0\n',
  });
  assert.equal(board.players[0].gender, '');
  assert.match(board.warnings[0].message, /No gender/);
});

test('a roster override supplies the gender the export omitted', () => {
  const board = buildBoard({
    x01Csv: 'Last,First,Gender,Division,Points Scored,3DA,HDI,HDO,100+,140+,180\n'
          + 'Baum,Aspen,,B Divison - Singles,46203,32.61,105,90,25,2,0\n',
    roster: { 'baum|aspen|b': { gender: 'F' } },
  });
  assert.equal(board.players[0].gender, 'F');
  assert.ok(!board.warnings.some((w) => /No gender/.test(w.message)), 'the gender warning should be gone');
});

test('the default order puts women first, then descending Total AS', () => {
  const board = buildBoard({
    cricketCsv: 'Last,First,Gender,Division,Marks Scored,MPR,6M,7M,8M,9M,3B,4B,5B,6B\n'
              + 'Low,Woman,F,A Division - Singles,0,1,1,0,0,0,0,0,0,0\n'
              + 'High,Man,M,A Division - Singles,0,1,9,0,0,0,0,0,0,0\n'
              + 'High,Woman,F,A Division - Singles,0,1,4,0,0,0,0,0,0,0\n',
  });
  assert.deepEqual(board.players.map((p) => p.name), ['Woman High', 'Woman Low', 'Man High']);
});

/* ------------------------------------------------------------------------
 * Against the real exports on disk, when they are available
 * ---------------------------------------------------------------------- */

const DOWNLOADS = 'C:/Users/wchoe/Downloads';
const CRICKET_FILE = `${DOWNLOADS}/BCDAS_Winter_Spring_2026_all_cricket_leaderboard.csv`;
const X01_FILE = `${DOWNLOADS}/BCDAS_Winter_Spring_2026_all_01_leaderboard.csv`;
const haveReal = existsSync(CRICKET_FILE) && existsSync(X01_FILE);

test('the real Winter/Spring 2026 Singles exports build a clean board', { skip: !haveReal }, () => {
  const board = buildBoard({
    cricketCsv: readFileSync(CRICKET_FILE, 'utf8'),
    x01Csv: readFileSync(X01_FILE, 'utf8'),
  });

  assert.equal(board.players.length, 17);
  assert.equal(board.meta.league, 'Singles');
  assert.deepEqual(board.meta.divisions, ['A', 'B']);
  assert.equal(board.meta.bandMode, 'bands', 'the real export carries per-band columns');
  assert.equal(board.meta.cumulative, true, 'and its 100+/140+ are cumulative');

  // Nobody is missing from either file, so the only warning is Aspen Baum's gender.
  assert.equal(board.warnings.length, 1);
  assert.match(board.warnings[0].message, /No gender/);

  const bear = board.players.find((p) => p.name === 'Bear Nance');
  assert.deepEqual(
    { cricketAS: bear.cricketAS, x01AS: bear.x01AS, totalAS: bear.totalAS },
    { cricketAS: 149, x01AS: 161, totalAS: 310 },
  );
  assert.deepEqual([bear.b100_139, bear.b140_179, bear.b180], [95, 29, 2]);
  assert.equal(bear.mpr, 2.75);
  assert.equal(bear.tda, 52.38);

  const records = computeRecords(board.players.filter((p) => p.division === 'A'));
  assert.equal(records.M.in.name, 'Bear Nance');
  assert.equal(records.M.in.value, 170);
  assert.equal(records.M.out.value, 164);
  assert.equal(records.F.in.name, 'Cris Campomezzi');
});

/* ------------------------------------------------------------------------
 * The Doubles exports are a different shape from Singles: every field is
 * quoted, there is an extra Team column, and Division reads "Doubles A"
 * rather than "A Division - Singles".
 * ---------------------------------------------------------------------- */

test('division parsing handles the Doubles export format too', () => {
  assert.deepEqual(parseDivision('Doubles A'), { division: 'A', league: 'Doubles', raw: 'Doubles A' });
  assert.deepEqual(parseDivision('Doubles B'), { division: 'B', league: 'Doubles', raw: 'Doubles B' });
  assert.equal(parseDivision('Teams A').league, 'Teams');
  assert.equal(parseDivision('Singles A').league, 'Singles');
});

test('a fully quoted export with a Team column parses', () => {
  const board = buildBoard({
    cricketCsv: `"Last","First","Gender","Team","Division","Marks Scored","MPR","6M","7M","8M","9M","3B","4B","5B","6B"
"Boud","Trish","F","Straight Trippin","Doubles A","264","2.36","3","1","0","0","4","0","0","1"
`,
    x01Csv: `"Last","First","Gender","Team","Division","Points Scored","3DA","HDI","HDO","100+","140+","180","T00_19","T20_39","T40_59","T60_79"
"Boud","Trish","F","Straight Trippin","Doubles A","4268","44.61","41","49","8","3","0","1","4","3","0"
`,
  });
  const p = board.players[0];
  assert.equal(p.team, 'Straight Trippin');
  assert.equal(p.division, 'A');
  assert.equal(p.league, 'Doubles');
  assert.equal(p.cricketAS, 13);
  assert.deepEqual([p.b100_139, p.b140_179, p.b180], [5, 3, 0]);
  assert.equal(p.x01AS, 5 + 6);
  assert.equal(board.warnings.length, 0);
});

test('a dash where a number should be is read as blank, not zero', () => {
  // Joey Curtis has "-" for Best Leg in the real Doubles export.
  assert.equal(num('-'), null);
  assert.equal(num(''), null);
  assert.equal(num('57'), 57);
});

const DBL_CRICKET = `${DOWNLOADS}/BCDAD_Summer_2026_all_cricket_leaderboard.csv`;
const DBL_X01 = `${DOWNLOADS}/BCDAD_Summer_2026_all_01_leaderboard.csv`;
const haveDoubles = existsSync(DBL_CRICKET) && existsSync(DBL_X01);

test('the real Summer 2026 Doubles exports build a clean board', { skip: !haveDoubles }, () => {
  const board = buildBoard({
    cricketCsv: readFileSync(DBL_CRICKET, 'utf8'),
    x01Csv: readFileSync(DBL_X01, 'utf8'),
  });

  assert.equal(board.players.length, 24);
  assert.equal(board.meta.league, 'Doubles');
  assert.deepEqual(board.meta.divisions, ['A', 'B']);
  assert.equal(board.meta.bandMode, 'bands');
  assert.equal(board.warnings.length, 0, 'nothing should need flagging in this export');

  // every player carries a team, which the Singles export never does
  assert.ok(board.players.every((p) => p.team), 'every Doubles player has a team');
  assert.equal(new Set(board.players.map((p) => p.team)).size, 11);

  const powers = board.players.find((p) => p.name === 'Mike Powers');
  assert.equal(powers.team, 'Welcome to Bradys');
  assert.deepEqual(
    { cricketAS: powers.cricketAS, x01AS: powers.x01AS, totalAS: powers.totalAS },
    { cricketAS: 17, x01AS: 11, totalAS: 28 },
  );

  const recA = computeRecords(board.players.filter((p) => p.division === 'A'));
  assert.equal(recA.M.in.name, 'Jeff Raschdorf');
  assert.equal(recA.M.in.value, 160);
  assert.equal(recA.M.out.name, 'Larry Holland');
  assert.equal(recA.M.out.value, 124);
  assert.equal(recA.F.in.name, 'Ally Heventhal');
});
