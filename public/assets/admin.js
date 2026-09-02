import { buildBoard, detectKind, toRecords } from './engine.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const show = (node, on) => node.classList.toggle('hide', !on);

const LEAGUES = ['Singles', 'Doubles', 'Teams'];
const TOKEN_KEY = 'bcda.admin.token';

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || null,
  league: 'Singles',
  files: { cricket: null, x01: null },   // { name, text }
  preview: null,
  live: null,
  roster: {},
  index: [],
};

/* --------------------------------------------------------------- requests */

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (auth && state.token) headers.authorization = `Bearer ${state.token}`;

  // Never a cached index: right after publishing, the admin must see the truth.
  const res = await fetch(path, {
    method, headers, cache: 'no-store',
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }

  if (res.status === 401 && auth) { signOut(); throw new Error(data.error || 'Session expired.'); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

/* ------------------------------------------------------------------- gate */

function signOut() {
  state.token = null;
  sessionStorage.removeItem(TOKEN_KEY);
  show($('app'), false);
  show($('gate'), true);
}

async function signIn(event) {
  event.preventDefault();
  const btn = $('gateBtn');
  const msg = $('gateMsg');
  btn.disabled = true;
  show(msg, false);
  try {
    const { token } = await api('api/login', {
      method: 'POST', auth: false, body: { passcode: $('passcode').value },
    });
    state.token = token;
    sessionStorage.setItem(TOKEN_KEY, token);
    $('passcode').value = '';
    await enterApp();
  } catch (err) {
    msg.textContent = err.message;
    show(msg, true);
  } finally {
    btn.disabled = false;
  }
}

async function enterApp() {
  show($('gate'), false);
  show($('app'), true);
  renderLeagues();
  try {
    const { roster } = await api('api/admin/roster');
    state.roster = roster || {};
  } catch { state.roster = {}; }
  await refreshIndex();
}

/* -------------------------------------------------------------- selectors */

function renderLeagues() {
  const box = $('leagues');
  box.replaceChildren();
  for (const lg of LEAGUES) {
    const b = el('button', 'tab', lg);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(lg === state.league));
    b.addEventListener('click', () => {
      state.league = lg;
      renderLeagues();
      loadLive();
      loadHistory();
    });
    box.append(b);
  }
}

async function refreshIndex() {
  try {
    const { index } = await api('api/stats', { auth: false });
    state.index = index || [];
  } catch { state.index = []; }

  const list = $('seasons');
  list.replaceChildren();
  for (const s of [...new Set(state.index.map((e) => e.season))]) {
    const o = document.createElement('option');
    o.value = s;
    list.append(o);
  }
  if (!$('season').value && state.index.length) $('season').value = state.index[0].season;
  loadLive();
  loadHistory();
}

async function loadLive() {
  const season = $('season').value.trim();
  if (!season) { state.live = null; return; }
  try {
    const { board } = await api(
      `api/stats?season=${encodeURIComponent(season)}&league=${encodeURIComponent(state.league)}`,
      { auth: false },
    );
    state.live = board && board.league === state.league ? board : null;
  } catch { state.live = null; }
  if (state.preview) renderPreview();
}

/* ------------------------------------------------------------------ files */

function slotName(kind, name) {
  const slot = kind === 'cricket' ? $('slotCricket') : $('slotX01');
  const label = kind === 'cricket' ? $('nameCricket') : $('nameX01');
  label.textContent = name || 'Nothing yet';
  label.classList.toggle('none', !name);
  slot.classList.toggle('filled', !!name);
}

async function takeFiles(fileList) {
  const msg = $('dropMsg');
  show(msg, false);
  const problems = [];

  for (const file of [...fileList]) {
    const text = await file.text();
    const kind = detectKind(toRecords(text).headers);
    if (!kind) {
      problems.push(`${file.name} is not a DartConnect leaderboard export — no MPR or 3DA column in it.`);
      continue;
    }
    if (state.files[kind]) {
      problems.push(`Two ${kind === 'cricket' ? 'cricket' : "'01"} files were dropped. Keeping ${file.name}.`);
    }
    state.files[kind] = { name: file.name, text };
    slotName(kind, file.name);
  }

  if (problems.length) {
    msg.textContent = problems.join(' ');
    show(msg, true);
  }
  $('processBtn').disabled = !(state.files.cricket || state.files.x01);
}

function clearFiles() {
  state.files = { cricket: null, x01: null };
  state.preview = null;
  slotName('cricket', null);
  slotName('x01', null);
  show($('dropMsg'), false);
  show($('previewCard'), false);
  show($('rosterCard'), false);
  $('processBtn').disabled = true;
}

/* ---------------------------------------------------------------- preview */

function process() {
  const built = buildBoard({
    cricketCsv: state.files.cricket?.text ?? '',
    x01Csv: state.files.x01?.text ?? '',
    roster: state.roster,
  });
  state.preview = built;
  renderPreview();
  renderRoster();
  show($('previewCard'), true);
  $('previewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPreview() {
  const { players, warnings, meta } = state.preview;
  const liveByKey = new Map((state.live?.players ?? []).map((p) => [p.key, p]));

  const badge = $('modeBadge');
  badge.textContent = meta.bandMode === 'bands'
    ? 'Scored from per-band columns'
    : "Scored from cumulative 100+ / 140+";

  const changed = players.filter((p) => {
    const was = liveByKey.get(p.key);
    return was && was.totalAS !== p.totalAS;
  }).length;
  const fresh = players.filter((p) => !liveByKey.has(p.key)).length;

  const stats = $('stats');
  stats.replaceChildren();
  const cells = [
    [players.length, 'Players'],
    [meta.divisions.join(' + ') || '—', 'Divisions'],
    [state.live ? fresh : players.length, state.live ? 'New' : 'All new'],
    [state.live ? changed : '—', 'Changed'],
    [warnings.filter((w) => w.level === 'warn').length, 'Warnings'],
  ];
  for (const [n, l] of cells) {
    const d = el('div');
    d.append(el('span', 'n', String(n)), el('span', 'l', l));
    stats.append(d);
  }

  const wl = $('warnings');
  wl.replaceChildren();
  show(wl, warnings.length > 0);
  for (const w of warnings) {
    wl.append(el('div', w.level === 'info' ? 'info' : '', w.player ? `${w.player}: ${w.message}` : w.message));
  }

  const cols = [
    ['Player', 'text'], ['Gender', 'text'], ['Team', 'text'], ['Div', 'text'],
    ['Cricket AS', ''], ["'01 AS", ''], ['Total AS', 'total'], ['vs live', ''],
  ];
  const head = $('pvHead');
  head.replaceChildren();
  for (const [label, cls] of cols) head.append(el('th', cls, label));

  const rows = $('pvRows');
  rows.replaceChildren();
  for (const p of players) {
    const was = liveByKey.get(p.key);
    const tr = el('tr');
    tr.append(el('td', 'text', p.name));
    tr.append(el('td', 'text', p.gender || '—'));
    tr.append(el('td', 'text', p.team || '—'));
    tr.append(el('td', 'text', p.division || '—'));
    tr.append(el('td', null, String(p.cricketAS)));
    tr.append(el('td', null, String(p.x01AS)));
    tr.append(el('td', 'total', String(p.totalAS)));

    const diff = el('td');
    if (!state.live) diff.textContent = '—';
    else if (!was) { diff.textContent = 'new'; diff.className = 'delta new'; }
    else if (was.totalAS === p.totalAS) { diff.textContent = '·'; diff.className = 'dim'; }
    else {
      const d = p.totalAS - was.totalAS;
      diff.textContent = `${d > 0 ? '+' : ''}${d}`;
      diff.className = `delta ${d > 0 ? 'up' : ''}`;
    }
    tr.append(diff);
    rows.append(tr);
  }
}

/* ----------------------------------------------------------------- roster */

function renderRoster() {
  const needing = state.preview.players.filter((p) => !p.gender || state.roster[p.key]);
  show($('rosterCard'), needing.length > 0);
  const body = $('rosterRows');
  body.replaceChildren();

  for (const p of needing) {
    const tr = el('tr');
    tr.append(el('td', 'text', p.name));

    const gcell = el('td', 'text');
    const sel = el('select', 'input');
    sel.style.height = '32px';
    for (const [v, label] of [['', 'Not set'], ['F', 'Women'], ['M', 'Men']]) {
      const o = el('option', null, label);
      o.value = v;
      o.selected = (state.roster[p.key]?.gender ?? p.gender ?? '') === v;
      sel.append(o);
    }
    sel.dataset.key = p.key;
    sel.dataset.field = 'gender';
    gcell.append(sel);
    tr.append(gcell);

    const tcell = el('td', 'text');
    const inp = el('input', 'input');
    inp.style.height = '32px';
    inp.value = state.roster[p.key]?.team ?? p.team ?? '';
    inp.placeholder = 'Team';
    inp.dataset.key = p.key;
    inp.dataset.field = 'team';
    tcell.append(inp);
    tr.append(tcell);

    body.append(tr);
  }
}

async function saveRoster() {
  const next = { ...state.roster };
  for (const node of $('rosterRows').querySelectorAll('[data-key]')) {
    const { key, field } = node.dataset;
    const value = node.value.trim();
    next[key] = next[key] || {};
    if (value) next[key][field] = value;
    else delete next[key][field];
    if (!Object.keys(next[key]).length) delete next[key];
  }
  const msg = $('rosterMsg');
  try {
    const { roster } = await api('api/admin/roster', { method: 'POST', body: { roster: next } });
    state.roster = roster;
    msg.className = 'msg good';
    msg.textContent = 'Roster fixes saved. Re-processing with them applied.';
    show(msg, true);
    process();
  } catch (err) {
    msg.className = 'msg bad';
    msg.textContent = err.message;
    show(msg, true);
  }
}

/* ---------------------------------------------------------------- publish */

async function publish() {
  const season = $('season').value.trim();
  const msg = $('pubMsg');
  const btn = $('publishBtn');
  show(msg, false);

  if (!season) {
    msg.className = 'msg bad';
    msg.textContent = 'Give the season a name first.';
    show(msg, true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Publishing…';
  try {
    await api('api/publish', {
      method: 'POST',
      body: {
        season,
        league: state.league,
        cricketCsv: state.files.cricket?.text ?? '',
        x01Csv: state.files.x01?.text ?? '',
        cricketName: state.files.cricket?.name ?? '',
        x01Name: state.files.x01?.name ?? '',
      },
    });
    msg.className = 'msg good';
    msg.textContent = `Published. ${state.league} ${season} is live on the scoreboard.`;
    show(msg, true);
    await refreshIndex();
  } catch (err) {
    msg.className = 'msg bad';
    msg.textContent = err.message;
    show(msg, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish to the scoreboard';
  }
}

/* ---------------------------------------------------------------- history */

async function loadHistory() {
  const season = $('season').value.trim();
  const box = $('history');
  const note = $('historyNote');
  box.replaceChildren();

  if (!season) { note.textContent = 'Name a season to see what has been published.'; return; }

  let versions = [];
  try {
    const data = await api(
      `api/admin/versions?season=${encodeURIComponent(season)}&league=${encodeURIComponent(state.league)}`,
    );
    versions = data.versions || [];
  } catch (err) {
    note.textContent = err.message;
    return;
  }

  if (!versions.length) {
    note.textContent = `Nothing published yet for ${state.league} ${season}.`;
    return;
  }
  note.textContent = `${versions.length} version${versions.length === 1 ? '' : 's'} of ${state.league} ${season}.`;

  for (const v of versions) {
    const row = el('div', 'histrow');
    const when = new Date(v.updatedAt);
    row.append(el('b', null, when.toLocaleString(undefined,
      { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
    row.append(el('span', 'note', `${v.players} players · ${v.divisions.join(' + ') || 'no divisions'}`));
    if (v.warnings) row.append(el('span', 'badge warn', `${v.warnings} warning${v.warnings === 1 ? '' : 's'}`));
    row.append(el('span', 'grow'));
    if (v.live) {
      row.append(el('span', 'badge ok', 'Live'));
    } else {
      const b = el('button', 'btn', 'Restore');
      b.type = 'button';
      b.addEventListener('click', async () => {
        b.disabled = true;
        b.textContent = 'Restoring…';
        try {
          await api('api/admin/rollback', {
            method: 'POST', body: { season, league: state.league, versionId: v.versionId },
          });
          await refreshIndex();
        } catch (err) {
          b.textContent = err.message;
        }
      });
      row.append(b);
    }
    box.append(row);
  }
}

/* ------------------------------------------------------------------- wire */

$('gateForm').addEventListener('submit', signIn);
$('signOut').addEventListener('click', signOut);
$('clearBtn').addEventListener('click', clearFiles);
$('processBtn').addEventListener('click', process);
$('publishBtn').addEventListener('click', publish);
$('rosterBtn').addEventListener('click', saveRoster);
$('season').addEventListener('change', () => { loadLive(); loadHistory(); });

const drop = $('drop');
const fileInput = $('file');
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => { takeFiles(fileInput.files); fileInput.value = ''; });

for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('over'); });
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove('over'); });
}
drop.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files?.length) takeFiles(e.dataTransfer.files);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

if (state.token) enterApp();
