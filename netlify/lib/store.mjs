import { getStore } from '@netlify/blobs';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export const STORE = 'bcda';
export const SESSION_HOURS = 8;

export const store = () => getStore(STORE);

/* ------------------------------------------------------------------ keys */

export const slug = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

export const boardKey = (season, league) => `board/${slug(season)}/${slug(league)}`;
export const versionKey = (season, league, id) => `version/${slug(season)}/${slug(league)}/${id}`;
export const rawKey = (season, league, id, which) => `raw/${slug(season)}/${slug(league)}/${id}/${which}`;
export const INDEX_KEY = 'index';
export const ROSTER_KEY = 'roster';

export const newVersionId = () =>
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;

/* ------------------------------------------------------------------ index */

export async function readIndex() {
  const raw = await store().get(INDEX_KEY, { type: 'json' });
  return Array.isArray(raw) ? raw : [];
}

export async function writeIndex(entries) {
  await store().setJSON(INDEX_KEY, entries);
}

/** Insert or replace the entry for one season+league, newest first. */
export function upsertIndex(entries, entry) {
  const rest = entries.filter(
    (e) => !(e.seasonSlug === entry.seasonSlug && e.league === entry.league),
  );
  return [entry, ...rest].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function readRoster() {
  const raw = await store().get(ROSTER_KEY, { type: 'json' });
  return raw && typeof raw === 'object' ? raw : {};
}

/* ------------------------------------------------------------------- auth */

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function secret() {
  const s = process.env.BCDA_SESSION_SECRET;
  if (!s) throw new Error('BCDA_SESSION_SECRET is not set on this site.');
  return s;
}

export function passcode() {
  const p = process.env.BCDA_ADMIN_PASSCODE;
  if (!p) throw new Error('BCDA_ADMIN_PASSCODE is not set on this site.');
  return p;
}

export function issueToken() {
  const body = b64url(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600_000 }));
  const sig = b64url(createHmac('sha256', secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [body, sig] = token.split('.', 2);
  const expected = b64url(createHmac('sha256', secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

/** Constant-time compare for the passcode itself. */
export function passcodeMatches(supplied) {
  const a = Buffer.from(String(supplied ?? ''));
  const b = Buffer.from(passcode());
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ----------------------------------------------------------------- replies */

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const fail = (message, status = 400) => json({ error: message }, status);

/** Wrap an authenticated handler; rejects anything without a live session. */
export function requireAuth(handler) {
  return async (req, context) => {
    const header = req.headers.get('authorization') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    let ok = false;
    try {
      ok = verifyToken(token);
    } catch (err) {
      return fail(err.message, 500);
    }
    if (!ok) return fail('Your session has expired. Sign in again.', 401);
    return handler(req, context);
  };
}
