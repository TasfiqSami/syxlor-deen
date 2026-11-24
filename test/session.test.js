import test from 'node:test';
import assert from 'node:assert/strict';
import { getCookie, sessionForRequest } from '../src/server/session.js';

const requestWithCookie = (cookie) => ({ headers: { cookie } });

test('keeps an expired access-token session when a refresh token is available', () => {
  const session = { accessToken: 'expired-access-token', refreshToken: 'refresh-token', expiresAt: 999 };
  const sessions = new Map([['session-id', session]]);

  assert.equal(sessionForRequest(requestWithCookie('syxlor_sid=session-id'), sessions, 1_000), session);
  assert.equal(sessions.get('session-id'), session);
});

test('removes an expired session when no refresh token is available', () => {
  const sessions = new Map([['session-id', { accessToken: 'expired-access-token', expiresAt: 999 }]]);

  assert.equal(sessionForRequest(requestWithCookie('syxlor_sid=session-id'), sessions, 1_000), null);
  assert.equal(sessions.has('session-id'), false);
});

test('returns an unexpired session without requiring a refresh token', () => {
  const session = { accessToken: 'valid-access-token', expiresAt: 2_000 };
  const sessions = new Map([['session-id', session]]);

  assert.equal(sessionForRequest(requestWithCookie('syxlor_sid=session-id'), sessions, 1_000), session);
});

test('ignores malformed percent-encoded cookie values without throwing', () => {
  assert.equal(getCookie(requestWithCookie('syxlor_sid=%E0%A4%A'), 'syxlor_sid'), '');
  assert.equal(sessionForRequest(requestWithCookie('syxlor_sid=%E0%A4%A'), new Map(), 1_000), null);
});
