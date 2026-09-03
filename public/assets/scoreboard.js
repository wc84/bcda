import { computeRecords, defaultOrder } from './engine.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const show = (node, on) => node.classList.toggle('hide', !on);

/* ------------------------------------------------------------------ model */

const COLUMNS = [
  { key: 'name',      label: 'Player',   type: 'text', pin: true, group: 'id' },
  { key: 'team',      label: 'Team',     type: 'text', optional: 'team', group: 'id' },
  { key: 'division',  label: 'Div',      type: 'text', optional: 'division', group: 'id' },
  { key: 'm6',        label: '6M',       group: 'cricket', edge: true },
  { key: 'm7',        label: '7M',       group: 'cricket' },
  { key: 'm8',        label: '8M',       group: 'cricket' },
  { key: 'm9',        label: '9M',       group: 'cricket' },
  { key: 'b3',        label: '3B',       group: 'cricket' },
  { key: 'b4',        label: '4B',       group: 'cricket' },
  { key: 'b5',        label: '5B',       group: 'cricket' },
  { key: 'b6',        label: '6B',       group: 'cricket' },
  { key: 'mpr',       label: 'MPR',      group: 'cricket', dec: 2, dim: true, keep: true },
  { key: 'hdi',       label: 'HDI',      group: 'x01', edge: true, keep: true },
  { key: 'hdo',       label: 'HDO',      group: 'x01', keep: true },
  { key: 'b100_139',  label: '100+',     group: 'x01', hint: 'Turns of 100-139' },
  { key: 'b140_179',  label: '140+',     group: 'x01', hint: 'Turns of 140-179' },
  { key: 'b180',      label: '180',      group: 'x01' },
  { key: 'tda',       label: '3DA',      group: 'x01', dec: 2, dim: true, keep: true },
  { key: 'cricketAS', label: 'Cricket',  group: 'totals', cls: 'as', edge: true, keep: true },
  { key: 'x01AS',     label: "'01",      group: 'totals', cls: 'as', keep: true },
  { key: 'totalAS',   label: 'Total AS', group: 'totals', cls: 'total', th: 'total', keep: true },
];

const SORTS = [
  ['totalAS', 'Total AS'], ['cricketAS', 'Cricket'], ['x01AS', "'01"],
  ['mpr', 'MPR'], ['tda', '3DA'], ['b180', '180s'], ['hdo', 'High out'], ['name', 'A-Z'],
];

const GROUP_TABS = [['totals', 'Totals'], ['cricket', 'Cricket'], ['x01', "'01"]];

const NARROW = window.matchMedia('(max-width: 760px)');

const state = {
  index: [], board: null,
  season: null, league: null, division: 'ALL',
  view: 'cards', group: 'totals',
  sort: null, dir: 'desc',
};

try {
  const saved = localStorage.getItem('bcda.view');
  if (saved === 'cards' || saved === 'table') state.view = saved;
} catch { /* private mode */ }

/* -------------------------------------------------------------- deep links */

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('season')) state.season = p.get('season');
  if (p.get('league')) state.league = p.get('league');
  if (p.get('div')) state.division = p.get('div');
  if (p.get('view') === 'cards' || p.get('view') === 'table') state.view = p.get('view');
  if (p.get('sort')) state.sort = p.get('sort');
  if (p.get('dir')) state.dir = p.get('dir') === 'asc' ? 'asc' : 'desc';
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.season) p.set('season', state.season);
  if (state.league) p.set('league', state.league);
  if (state.division !== 'ALL') p.set('div', state.division);
  p.set('view', state.view);
  if (state.sort) { p.set('sort', state.sort); p.set('dir', state.dir); }
  history.replaceState(null, '', `#${p}`);
}

/* ------------------------------------------------------------------ chrome */

function tab(label, selected, onClick, cls = 'tab') {
  const b = el('button', cls, label);
  b.type = 'button';
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-selected', String(selected));
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Singles A scores on a different scale from Singles B, so a combined ranking
 * puts the strongest players near the bottom. Say so rather than let the board
 * look broken.
 */
function renderScoreNote(players) {
  const note = $('scoreNote');
  const elite = players.filter((p) => p.scoring === 'elite').length;
  const standard = players.length - elite;

  if (elite && standard) {
    note.textContent = 'A Division scores only 9-mark rounds, 6 corks and 180s '
      + '(4 points each), so A and B totals are not comparable. Pick a division to '
      + 'rank like with like.';
  } else if (elite) {
    note.textContent = 'A Division scores only 9-mark rounds, 6 corks and 180s — '
      + '4 points each. Every other stat is shown but does not earn points.';
  }
  show(note, elite > 0);
}

function renderChrome() {
  const seasons = [...new Set(state.index.map((e) => e.seasonSlug))]
    .map((slug) => state.index.find((e) => e.seasonSlug === slug));

  $('season').textContent = state.board
    ? state.board.season
    : 'Broward County Darts Association';

  if (state.board) {
    const d = new Date(state.board.updatedAt);
    $('when').textContent = `Updated ${d.toLocaleDateString(undefined,
      { month: 'short', day: 'numeric' })}`;
  }

  const lt = $('leagues');
  lt.replaceChildren();
  const here = state.index.filter((e) => e.seasonSlug === state.season).map((e) => e.league);
  for (const lg of ['Singles', 'Doubles', 'Teams']) {
    const inSeason = here.includes(lg);
    // index is newest-first, so this is the most recent season carrying that league
    const elsewhere = inSeason ? null : state.index.find((e) => e.league === lg);
    const b = tab(lg, lg === state.league, () => {
      if (!inSeason && !elsewhere) return;
      if (elsewhere) state.season = elsewhere.seasonSlug;   // follow the league to its season
      state.league = lg;
      state.division = 'ALL';
      load();
    }, '');
    if (!inSeason && !elsewhere) {
      b.disabled = true;
      b.title = `No ${lg} board published yet`;
      b.style.opacity = '.4';
    } else if (elsewhere) {
      b.title = `${lg} is published under ${elsewhere.season}`;
    }
    lt.append(b);
  }

  // Seasons get their own row. Mixed in with the divisions they look identical
  // and read as one confusing list the moment a second season exists.
  const st = $('seasons');
  st.replaceChildren();
  show(st, seasons.length >= 2);
  for (const entry of seasons) {
    st.append(tab(entry.season, entry.seasonSlug === state.season, () => {
      state.season = entry.seasonSlug; state.league = null; load();
    }, ''));
  }

  const divs = state.board ? state.board.meta.divisions : [];
  const dt = $('divisions');
  dt.replaceChildren();
  show(dt, divs.length >= 2);
  if (divs.length >= 2) {
    dt.append(tab('All divisions', state.division === 'ALL',
      () => { state.division = 'ALL'; render(); }, ''));
    for (const d of divs) {
      dt.append(tab(`${d} Division`, state.division === d,
        () => { state.division = d; render(); }, ''));
    }
  }
}

/* ------------------------------------------------------- chalkboard tiles */

const ICON_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h11"/><path d="M10 7l5 5-5 5"/><circle cx="19.5" cy="12" r="2.5"/></svg>';
const ICON_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="4.5" cy="12" r="2.5"/><path d="M9 12h11"/><path d="M15 7l5 5-5 5"/></svg>';

function renderTiles(players) {
  const rec = computeRecords(players);
  const box = $('tiles');
  box.replaceChildren();

  const spec = [
    ['women', 'F', 'in', "Women's High In", ICON_IN],
    ['women', 'F', 'out', "Women's High Out", ICON_OUT],
    ['men', 'M', 'in', "Men's High In", ICON_IN],
    ['men', 'M', 'out', "Men's High Out", ICON_OUT],
  ];

  for (const [cls, gender, kind, label, icon] of spec) {
    const hit = rec[gender] && rec[gender][kind];
    const tile = el('div', `tile ${cls}${hit ? '' : ' empty'}`);
    const lab = el('span', 'l');
    lab.innerHTML = `${icon}<span></span>`;
    lab.lastElementChild.textContent = label;
    tile.append(lab, el('span', 'v', hit ? String(hit.value) : '—'));
    tile.append(el('span', 'w', hit ? (hit.team ? `${hit.name} · ${hit.team}` : hit.name)
                                   : 'not thrown yet'));
    box.append(tile);
  }
}

/* ----------------------------------------------------------------- sorting */

function sortPlayers(players) {
  if (!state.sort) return [...players].sort(defaultOrder);
  const col = COLUMNS.find((c) => c.key === state.sort);
  const dir = state.dir === 'asc' ? 1 : -1;
  return [...players].sort((a, b) => {
    const x = a[state.sort];
    const y = b[state.sort];
    if (col && col.type === 'text') {
      return String(x ?? '').localeCompare(String(y ?? '')) * dir || a.last.localeCompare(b.last);
    }
    const xa = typeof x === 'number' ? x : null;
    const ya = typeof y === 'number' ? y : null;
    if (xa === null && ya === null) return a.last.localeCompare(b.last);
    if (xa === null) return 1;
    if (ya === null) return -1;
    return (xa - ya) * dir || a.last.localeCompare(b.last);
  });
}

/** Columns worth showing: drops all-zero stat columns and unused text columns. */
function visibleColumns(players) {
  return COLUMNS.filter((c) => {
    if (c.optional === 'team') return players.some((p) => p.team);
    if (c.optional === 'division') return new Set(players.map((p) => p.division)).size > 1;
    if (c.type === 'text' || c.keep) return true;
    return players.some((p) => typeof p[c.key] === 'number' && p[c.key] !== 0);
  });
}

/* ------------------------------------------------------------- cards view */

const num = (v, dec) => (v === null || v === undefined || v === ''
  ? '—' : (typeof v === 'number' && dec ? v.toFixed(dec) : String(v)));

function renderChips() {
  const box = $('chips');
  box.replaceChildren();
  for (const [key, label] of SORTS) {
    const active = state.sort === key || (!state.sort && key === 'totalAS');
    const b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(active));
    b.addEventListener('click', () => {
      // Total AS is the sheet's own order, which also keeps the women / men blocks.
      state.sort = key === 'totalAS' ? null : key;
      state.dir = key === 'name' ? 'asc' : 'desc';
      render();
    });
    box.append(b);
  }
}

function renderCards(players) {
  const box = $('cards');
  box.replaceChildren();
  const sorted = sortPlayers(players);
  const grouped = !state.sort;   // sheet order keeps the women / men blocks

  let seen = null;
  let rank = 0;
  for (const p of sorted) {
    if (grouped && p.gender !== seen) {
      seen = p.gender;
      rank = 0;
      const h = el('div', 'mlab');
      h.style.gridColumn = '1 / -1';
      h.style.margin = '6px 0 0';
      h.textContent = p.gender === 'F' ? 'Women' : p.gender === 'M' ? 'Men' : 'Gender not recorded';
      box.append(h);
    }
    rank += 1;

    const card = el('div', `pc${rank <= 3 ? ` g${rank}` : ''}`);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-expanded', 'false');

    const top = el('div', 'top');
    top.append(el('div', 'rank', String(rank)));
    const who = el('div', 'who');
    who.append(el('div', 'n', p.name));
    who.append(el('div', 'm', [p.team || null, p.division ? `${p.division} Div` : null]
      .filter(Boolean).join(' · ') || '—'));
    top.append(who);
    const tot = el('div', 'tot');
    tot.append(el('div', 'v', String(p.totalAS)));
    tot.append(el('div', 'l', 'Total AS'));
    top.append(tot);
    card.append(top);

    const strip = el('div', 'strip');
    for (const [k, v] of [['Cricket', p.cricketAS], ["'01", p.x01AS],
                          ['MPR', num(p.mpr, 2)], ['3DA', num(p.tda, 2)]]) {
      const d = el('div');
      d.append(el('span', 'k', k), el('span', 'sv', String(v)));
      strip.append(d);
    }
    card.append(strip);

    const more = el('div', 'more');
    const block = (label, pairs) => {
      more.append(el('div', 'mlab', label));
      const g = el('div', 'mgrid');
      for (const [lbl, val] of pairs) {
        const s = el('span');
        s.append(el('b', null, String(val)), el('i', null, lbl));
        g.append(s);
      }
      more.append(g);
    };
    block('Cricket marks & corks', [['6M', p.m6], ['7M', p.m7], ['8M', p.m8], ['9M', p.m9],
      ['3B', p.b3], ['4B', p.b4], ['5B', p.b5], ['6B', p.b6]]);
    block("'01 scoring", [['100+', p.b100_139], ['140+', p.b140_179], ['180', p.b180],
      ['High in', num(p.hdi)], ['High out', num(p.hdo)], ['3DA', num(p.tda, 2)],
      ['Cricket AS', p.cricketAS], ["'01 AS", p.x01AS]]);
    card.append(more);

    const toggle = () => {
      card.classList.toggle('open');
      card.setAttribute('aria-expanded', String(card.classList.contains('open')));
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    box.append(card);
  }
}

/* ------------------------------------------------------------- table view */

function renderGroupTabs() {
  const box = $('gtabs');
  box.replaceChildren();
  for (const [key, label] of GROUP_TABS) {
    const b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(state.group === key));
    b.addEventListener('click', () => { state.group = key; render(); });
    box.append(b);
  }
}

function renderTable(players) {
  let cols = visibleColumns(players);
  if (NARROW.matches) cols = cols.filter((c) => c.group === 'id' || c.group === state.group);

  const head = $('head');
  head.replaceChildren();
  head.append(el('th', 'r', '#'));

  for (const c of cols) {
    const th = el('th', [c.pin ? 'pin' : '', c.type === 'text' ? 'text' : '',
      c.th || '', c.edge && !NARROW.matches ? 'grp' : ''].filter(Boolean).join(' '));
    th.tabIndex = 0;
    th.title = c.hint ? `${c.hint} — click to sort` : `Sort by ${c.label}`;
    th.append(document.createTextNode(c.label));
    if (state.sort === c.key) {
      th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
      th.append(el('span', 'arrow', state.dir === 'asc' ? '▲' : '▼'));
    } else {
      th.append(el('span', 'arrow', '⇅'));
    }
    const activate = () => {
      if (state.sort === c.key) {
        if (state.dir === 'asc') state.sort = null;
        else state.dir = 'asc';
      } else {
        state.sort = c.key;
        state.dir = c.type === 'text' ? 'asc' : 'desc';
      }
      render();
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
    head.append(th);
  }

  const body = $('rows');
  body.replaceChildren();
  const sorted = sortPlayers(players);

  sorted.forEach((p, i) => {
    const tr = el('tr');
    tr.append(el('td', 'r', String(i + 1)));
    for (const c of cols) {
      const td = el('td', [c.pin ? 'pin' : '', c.type === 'text' ? 'text' : '', c.cls || '',
        c.dim ? 'dim' : '', c.edge && !NARROW.matches ? 'grp' : ''].filter(Boolean).join(' '));
      if (c.pin) {
        const dot = el('i', `gdot ${p.gender === 'F' ? 'F' : p.gender === 'M' ? 'M' : 'X'}`);
        dot.title = p.gender === 'F' ? 'Women' : p.gender === 'M' ? 'Men' : 'Not recorded';
        td.append(dot, el('span', 'nm', p.name));
      } else {
        const v = p[c.key];
        td.textContent = num(v, c.dec);
        if (v === null || v === undefined || v === '') td.classList.add('dim');
      }
      tr.append(td);
    }
    body.append(tr);
  });
}

/* ---------------------------------------------------------------- compose */

function setView(view) {
  state.view = view;
  try { localStorage.setItem('bcda.view', view); } catch { /* private mode */ }
  render();
}

function render() {
  if (!state.board) return;
  const players = state.board.players.filter(
    (p) => state.division === 'ALL' || p.division === state.division,
  );

  renderChrome();
  renderTiles(players);
  renderScoreNote(players);

  const cards = state.view === 'cards';
  $('vtoggle').dataset.view = state.view;
  $('viewCards').setAttribute('aria-pressed', String(cards));
  $('viewTable').setAttribute('aria-pressed', String(!cards));
  show($('cards'), cards && players.length > 0);
  show($('tablewrap'), !cards && players.length > 0);
  show($('chips'), cards);
  show($('gtabs'), !cards && NARROW.matches);
  $('legendHint').textContent = cards
    ? 'Tap a card for the full line'
    : 'Tap any column to sort';

  if (!players.length) {
    showMessage('Nothing here yet', 'No players published for this league and division.');
    return;
  }
  show($('empty'), false);

  if (cards) { renderChips(); renderCards(players); }
  else { renderGroupTabs(); renderTable(players); }

  writeHash();
}

function showMessage(title, detail) {
  $('tiles').replaceChildren();
  show($('cards'), false);
  show($('tablewrap'), false);
  show($('chips'), false);
  show($('gtabs'), false);
  const e = $('empty');
  show(e, true);
  e.replaceChildren();
  e.append(el('b', null, title));
  e.append(document.createTextNode(detail));
}

/* ------------------------------------------------------------------- data */

async function load() {
  const p = new URLSearchParams();
  if (state.season) p.set('season', state.season);
  if (state.league) p.set('league', state.league);

  let payload;
  try {
    const res = await fetch(`api/stats?${p}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (err) {
    showMessage('Standings could not be loaded', `${err.message}. Pull to refresh and try again.`);
    return;
  }

  state.index = payload.index || [];
  state.board = payload.board || null;

  if (!state.board) {
    renderChrome();
    showMessage('No standings yet', 'Once an admin uploads a week of results they show up here.');
    return;
  }

  state.season = state.board.seasonSlug;
  state.league = state.board.league;
  if (state.division !== 'ALL' && !state.board.meta.divisions.includes(state.division)) {
    state.division = 'ALL';
  }
  render();
}

$('viewCards').addEventListener('click', () => setView('cards'));
$('viewTable').addEventListener('click', () => setView('table'));
NARROW.addEventListener('change', () => { if (state.board) render(); });

readHash();
load();
