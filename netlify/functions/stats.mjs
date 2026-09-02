import { store, boardKey, readIndex, slug, json, fail } from '../lib/store.mjs';

/** Public read. One request returns the index plus the requested (or latest) board. */
export default async (req) => {
  const url = new URL(req.url);
  const wantSeason = url.searchParams.get('season');
  const wantLeague = url.searchParams.get('league');

  let index;
  try {
    index = await readIndex();
  } catch (err) {
    return fail(`Standings storage is unavailable: ${err.message}`, 502);
  }

  if (!index.length) return json({ index: [], board: null });

  let entry = null;
  if (wantSeason && wantLeague) {
    entry = index.find((e) => e.seasonSlug === slug(wantSeason) && slug(e.league) === slug(wantLeague));
  } else if (wantSeason) {
    entry = index.find((e) => e.seasonSlug === slug(wantSeason));
  }
  entry = entry || index[0];

  const board = await store().get(boardKey(entry.season, entry.league), { type: 'json' });
  if (!board) return json({ index, board: null });

  return json({ index, board }, 200, { 'cache-control': 'public, max-age=30' });
};

export const config = { path: '/api/stats' };
