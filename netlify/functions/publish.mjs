import { buildBoard, detectKind, toRecords } from '../../public/assets/engine.mjs';
import {
  store, boardKey, versionKey, rawKey, slug, newVersionId,
  readIndex, writeIndex, upsertIndex, readRoster,
  requireAuth, json, fail,
} from '../lib/store.mjs';

const MAX_CSV_BYTES = 4 * 1024 * 1024;

/**
 * Recompute the board server-side from the raw uploads and publish it.
 * The admin preview runs the same engine module in the browser, so what an
 * admin approves and what gets stored cannot drift apart.
 */
export default requireAuth(async (req) => {
  if (req.method !== 'POST') return fail('Use POST.', 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return fail('Expected a JSON body.', 400);
  }

  const season = String(body.season ?? '').trim();
  const league = String(body.league ?? '').trim();
  const cricketCsv = String(body.cricketCsv ?? '');
  const x01Csv = String(body.x01Csv ?? '');

  if (!season) return fail('Give the season a name before publishing.');
  if (!['Singles', 'Doubles', 'Teams'].includes(league)) {
    return fail('Pick Singles, Doubles or Teams.');
  }
  if (!cricketCsv && !x01Csv) return fail('Attach at least one export.');
  if (cricketCsv.length > MAX_CSV_BYTES || x01Csv.length > MAX_CSV_BYTES) {
    return fail('That file is larger than 4 MB — it does not look like a leaderboard export.', 413);
  }

  // Re-verify the file kinds server-side; never trust the labels the browser sent.
  if (cricketCsv && detectKind(toRecords(cricketCsv).headers) !== 'cricket') {
    return fail('The cricket slot does not contain a cricket export.');
  }
  if (x01Csv && detectKind(toRecords(x01Csv).headers) !== 'x01') {
    return fail("The '01 slot does not contain an '01 export.");
  }

  let roster;
  try {
    roster = await readRoster();
  } catch (err) {
    return fail(`Storage is unavailable: ${err.message}`, 502);
  }

  const built = buildBoard({ cricketCsv, x01Csv, roster });
  if (!built.players.length) {
    return fail('No players were found in those files.');
  }

  const versionId = newVersionId();
  const board = {
    season,
    seasonSlug: slug(season),
    league,
    versionId,
    updatedAt: new Date().toISOString(),
    players: built.players,
    warnings: built.warnings,
    meta: built.meta,
    source: {
      cricketName: String(body.cricketName ?? ''),
      x01Name: String(body.x01Name ?? ''),
      cricketBytes: cricketCsv.length,
      x01Bytes: x01Csv.length,
    },
  };

  const s = store();
  try {
    await Promise.all([
      s.setJSON(boardKey(season, league), board),
      s.setJSON(versionKey(season, league, versionId), board),
      cricketCsv ? s.set(rawKey(season, league, versionId, 'cricket.csv'), cricketCsv) : null,
      x01Csv ? s.set(rawKey(season, league, versionId, 'x01.csv'), x01Csv) : null,
    ].filter(Boolean));

    const index = upsertIndex(await readIndex(), {
      season,
      seasonSlug: slug(season),
      league,
      versionId,
      updatedAt: board.updatedAt,
      players: built.players.length,
      divisions: built.meta.divisions,
    });
    await writeIndex(index);
    return json({ ok: true, board, index });
  } catch (err) {
    return fail(`Publishing failed: ${err.message}`, 502);
  }
});

export const config = { path: '/api/publish' };
