import { computeRecords, defaultOrder } from './engine.mjs';

/* ------------------------------------------------------------------ setup */

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const COLUMNS = [
  { key: 'name', label: 'Player', type: 'text', pin: true },
  { key: 'team', label: 'Team', type: 'text', optional: 'team' },
  { key: 'division', label: 'Div', type: 'text', optional: 'division' },
  { key: 'm6', label: '6M', group: true },
  { key: 'm7', label: '7M' },
  { key: 'm8', label: '8M' },
  { key: 'm9', label: '9M' },
  { key: 'b3', label: '3B' },
  { key: 'b4', label: '4B' },
  { key: 'b5', label: '5B' },
  { key: 'b6', label: '6B' },
  { key: 'mpr', label: 'MPR', dec: 2, dim: true },
  { key: 'hdi', label: 'HDI', group: true },
  { key: 'hdo', label: 'HDO' },
  { key: 'b100_139', label: '100-139' },
  { key: 'b140_179', label: '140-179' },
  { key: 'b180', label: '180' },
  { key: 'tda', label: '3DA', dec: 2, dim: true },
  { key: 'cricketAS', label: 'Cricket AS', cls: 'as', group: true },
  { key: 'x01AS', label: "'01 AS", cls: 'as' },
  { key: 'totalAS', label: 'Total AS', cls: 'total', th: 'total' },
];

const state = {
  index: [],
  board: null,
  season: null,
  league: null,
  division: 'ALL',
  sort: null,      // null = the sheet's own order
  dir: 'desc',
};

/* -------------------------------------------------------------- deep links */

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('season')) state.season = p.get('season');
  if (p.get('league')) state.league = p.get('league');
  if (p.get('div')) state.division = p.get('div');
  if (p.get('sort')) state.sort = p.get('sort');
  if (p.get('dir')) state.dir = p.get('dir') === 'asc' ? 'asc' : 'desc';
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.season) p.set('season', state.season);
  if (state.league) p.set('league', state.league);
  if (state.division !== 'ALL') p.set('div', state.division);
  if (state.sort) { p.set('sort', state.sort); p.set('dir', state.dir); }
  history.replaceState(null, '', `#${p}`);
}

/* -------------------------------------------------------------- rendering */

function tabButton(label, selected, onClick) {
  const b = el('button', 'tab', label);
  b.type = 'button';
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-selected', String(selected));
  b.addEventListener('click', onClick);
  return b;
}

function renderControls() {
  const seasons = [...new Set(state.index.map((e) => e.seasonSlug))]
    .map((slug) => state.index.find((e) => e.seasonSlug === slug));

  const sel = $('season');
  sel.replaceChildren();
  for (const entry of seasons) {
    const o = el('option', null, entry.season);
    o.value = entry.seasonSlug;
    o.selected = entry.seasonSlug === state.season;
    sel.append(o);
  }
  sel.parentElement.classList.toggle('hide', seasons.length < 2);
  sel.onchange = () => { state.season = sel.value; state.league = null; load(); };

  const leagues = state.index.filter((e) => e.seasonSlug === state.season).map((e) => e.league);
  const lt = $('leagues');
  lt.replaceChildren();
  for (const lg of ['Singles', 'Doubles', 'Teams']) {
    if (!leagues.includes(lg)) continue;
    lt.append(tabButton(lg, lg === state.league, () => { state.league = lg; state.division = 'ALL'; load(); }));
  }

  const divs = state.board ? state.board.meta.divisions : [];
  const dt = $('divisions');
  dt.replaceChildren();
  dt.classList.toggle('hide', divs.length < 2);
  if (divs.length >= 2) {
    dt.append(tabButton('All divisions', state.division === 'ALL', () => { state.division = 'ALL'; render(); }));
    for (const d of divs) {
      dt.append(tabButton(`${d} Division`, state.division === d, () => { state.division = d; render(); }));
    }
  }
}

const ICON_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h11"/><path d="M10 7l5 5-5 5"/><circle cx="19.5" cy="12" r="2.5"/></svg>';
const ICON_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="4.5" cy="12" r="2.5"/><path d="M9 12h11"/><path d="M15 7l5 5-5 5"/></svg>';

function renderTiles(players) {
  const rec = computeRecords(players);
  const tiles = $('tiles');
  tiles.replaceChildren();

  const spec = [
    ['women', 'F', 'in', "Women's High In", ICON_IN],
    ['women', 'F', 'out', "Women's High Out", ICON_OUT],
    ['men', 'M', 'in', "Men's High In", ICON_IN],
    ['men', 'M', 'out', "Men's High Out", ICON_OUT],
  ];

  for (const [cls, gender, kind, label, icon] of spec) {
    const hit = rec[gender] && rec[gender][kind];
    const tile = el('div', `tile ${cls}${hit ? '' : ' empty'}`);
    const lab = el('span', 'lab');
    lab.innerHTML = `${icon}<span>${label}</span>`;
    tile.append(lab, el('span', 'val', hit ? String(hit.value) : '—'));
    const who = el('span', 'who');
    if (hit) {
      who.append(el('b', null, hit.name));
      if (hit.team) who.append(document.createTextNode(` · ${hit.team}`));
    } else {
      who.textContent = 'Not recorded yet';
    }
    tile.append(who);
    tiles.append(tile);
  }
}

function visibleColumns(players) {
  const anyTeam = players.some((p) => p.team);
  const manyDivs = new Set(players.map((p) => p.division)).size > 1;
  return COLUMNS.filter((c) => {
    if (c.optional === 'team') return anyTeam;
    if (c.optional === 'division') return manyDivs;
    return true;
  });
}

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
    // Blanks always sink, whichever way the column is sorted.
    const xa = typeof x === 'number' ? x : null;
    const ya = typeof y === 'number' ? y : null;
    if (xa === null && ya === null) return a.last.localeCompare(b.last);
    if (xa === null) return 1;
    if (ya === null) return -1;
    return (xa - ya) * dir || a.last.localeCompare(b.last);
  });
}

function renderTable(players) {
  const cols = visibleColumns(players);
  const head = $('head');
  head.replaceChildren();

  for (const c of cols) {
    const th = el('th', [c.pin ? 'pin' : '', c.type === 'text' ? 'text' : '', c.th || '', c.group ? 'grp' : ''].filter(Boolean).join(' '));
    th.tabIndex = 0;
    th.title = `Sort by ${c.label}`;
    th.append(document.createTextNode(c.label));
    if (state.sort === c.key) {
      th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
      th.append(el('span', 'arrow', state.dir === 'asc' ? '▲' : '▼'));
    } else {
      th.append(el('span', 'arrow', '⇅'));
    }
    const activate = () => {
      if (state.sort === c.key) {
        // third click on the same column returns to the sheet's own order
        if (state.dir === 'asc') { state.sort = null; }
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

  for (const p of sorted) {
    const tr = el('tr');
    for (const c of cols) {
      const td = el('td', [c.pin ? 'pin' : '', c.type === 'text' ? 'text' : '', c.cls || '',
        c.dim ? 'dim' : '', c.group ? 'grp' : ''].filter(Boolean).join(' '));
      if (c.pin) {
        const dot = el('i', `gdot ${p.gender === 'F' ? 'F' : p.gender === 'M' ? 'M' : 'X'}`);
        dot.title = p.gender === 'F' ? 'Women' : p.gender === 'M' ? 'Men' : 'Not recorded';
        const nm = el('span', 'nm', p.name);
        td.append(dot, nm);
        if (!cols.some((x) => x.optional === 'team') && p.team) td.append(el('span', 'sub', p.team));
      } else {
        const v = p[c.key];
        if (v === null || v === undefined || v === '') td.textContent = '—';
        else if (typeof v === 'number') td.textContent = c.dec ? v.toFixed(c.dec) : String(v);
        else td.textContent = String(v);
        if (v === null || v === undefined || v === '') td.classList.add('dim');
      }
      tr.append(td);
    }
    body.append(tr);
  }

  const empty = $('empty');
  empty.classList.toggle('hide', sorted.length > 0);
  if (!sorted.length) {
    empty.replaceChildren();
    empty.append(el('b', null, 'Nothing here yet'));
    empty.append(document.createTextNode('No players have been published for this league and division.'));
  }
}

function render() {
  if (!state.board) return;
  const players = state.board.players.filter(
    (p) => state.division === 'ALL' || p.division === state.division,
  );
  renderControls();
  renderTiles(players);
  renderTable(players);
  writeHash();
}

function renderStamp() {
  const stamp = $('stamp');
  stamp.replaceChildren();
  if (!state.board) return;
  const when = new Date(state.board.updatedAt);
  const nice = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  stamp.append(el('b', null, `${state.board.league} · ${state.board.season}`));
  stamp.append(el('div', null, `Updated ${nice}`));
}

/* ------------------------------------------------------------------- data */

function showMessage(title, detail) {
  $('tiles').replaceChildren();
  $('head').replaceChildren();
  $('rows').replaceChildren();
  const empty = $('empty');
  empty.classList.remove('hide');
  empty.replaceChildren();
  empty.append(el('b', null, title));
  empty.append(document.createTextNode(detail));
}

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
    showMessage('Standings could not be loaded', `${err.message}. Refresh to try again.`);
    return;
  }

  state.index = payload.index || [];
  state.board = payload.board || null;

  if (!state.board) {
    renderControls();
    showMessage('No standings published yet', 'Once an admin uploads a week of results they will appear here.');
    return;
  }

  state.season = state.board.seasonSlug;
  state.league = state.board.league;
  if (state.division !== 'ALL' && !state.board.meta.divisions.includes(state.division)) {
    state.division = 'ALL';
  }
  renderStamp();
  render();
}

readHash();
load();
