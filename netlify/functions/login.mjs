import { passcodeMatches, issueToken, SESSION_HOURS, json, fail } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST.', 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return fail('Expected a JSON body.', 400);
  }

  try {
    if (!passcodeMatches(body.passcode)) {
      return fail('That passcode is not right.', 401);
    }
    return json({ token: issueToken(), expiresInHours: SESSION_HOURS });
  } catch (err) {
    return fail(err.message, 500);
  }
};

export const config = { path: '/api/login' };
