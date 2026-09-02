import {
  store, boardKey, versionKey, slug, ROSTER_KEY,
  readIndex, writeIndex, upsertIndex, readRoster,
  requireAuth, json, fail,
} from '../lib/store.mjs';

/** Version history, rollback and the roster overrides. All behind the passcode. */
export default requireAuth(async (req, context) => {
  const action = context.params?.action;
  const url = new URL(req.url);
  const s = store();

  try {
    /* ------------------------------------------------------------ versions */
    if (action === 'versions' && req.method === 'GET') {
      const season = url.searchParams.get('season') || '';
      const league = url.searchParams.get('league') || '';
      if (!season || !league) return fail('Name a season and a league.');

      const prefix = `version/${slug(season)}/${slug(league)}/`;
      const { blobs } = await s.list({ prefix });
      const current = await s.get(boardKey(season, league), { type: 'json' });

      const versions = [];
      for (const blob of blobs) {
        const v = await s.get(blob.key, { type: 'json' });
        if (!v) continue;
        versions.push({
          versionId: v.versionId,
          updatedAt: v.updatedAt,
          players: v.players.length,
          divisions: v.meta?.divisions ?? [],
          warnings: (v.warnings || []).filter((w) => w.level === 'warn').length,
          live: !!current && current.versionId === v.versionId,
        });
      }
      versions.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return json({ versions });
    }

    /* ------------------------------------------------------------ rollback */
    if (action === 'rollback' && req.method === 'POST') {
      const { season, league, versionId } = await req.json();
      if (!season || !league || !versionId) return fail('Name a season, league and version.');

      const snapshot = await s.get(versionKey(season, league, versionId), { type: 'json' });
      if (!snapshot) return fail('That version no longer exists.', 404);

      const restored = { ...snapshot, restoredAt: new Date().toISOString() };
      await s.setJSON(boardKey(season, league), restored);

      const index = upsertIndex(await readIndex(), {
        season: restored.season,
        seasonSlug: slug(restored.season),
        league: restored.league,
        versionId: restored.versionId,
        updatedAt: restored.updatedAt,
        players: restored.players.length,
        divisions: restored.meta?.divisions ?? [],
      });
      await writeIndex(index);
      return json({ ok: true, board: restored });
    }

    /* -------------------------------------------------------------- roster */
    if (action === 'roster' && req.method === 'GET') {
      return json({ roster: await readRoster() });
    }

    if (action === 'roster' && req.method === 'POST') {
      const { roster } = await req.json();
      if (!roster || typeof roster !== 'object') return fail('Expected a roster object.');

      const clean = {};
      for (const [key, value] of Object.entries(roster)) {
        if (!value || typeof value !== 'object') continue;
        const entry = {};
        const gender = String(value.gender ?? '').trim().toUpperCase();
        if (gender === 'F' || gender === 'M') entry.gender = gender;
        const team = String(value.team ?? '').trim();
        if (team) entry.team = team.slice(0, 80);
        if (Object.keys(entry).length) clean[String(key).slice(0, 200)] = entry;
      }
      await s.setJSON(ROSTER_KEY, clean);
      return json({ ok: true, roster: clean });
    }

    return fail('Unknown admin action.', 404);
  } catch (err) {
    return fail(`That did not work: ${err.message}`, 502);
  }
});

export const config = { path: '/api/admin/:action' };
