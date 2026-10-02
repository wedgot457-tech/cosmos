import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { signSession, readSession, checkOrigin, webUrl, number, passwordMatches } from '../server/security.js';
import { acceptImportedEntries } from '../public/js/store.js';
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
test('signed sessions reject tampering, expiration and reuse across roles', () => {
  const token = signSession('visitor-123', 'visitor', 60);
  assert.equal(readSession(token, 'visitor'), 'visitor-123');
  assert.equal(readSession(token, 'admin'), null);
  assert.equal(readSession(token + 'x', 'visitor'), null);
  assert.equal(readSession(signSession('visitor-123', 'visitor', -1), 'visitor'), null);
  assert.equal(readSession('true', 'admin'), null);
  const [payload, signature] = token.split('.');
  const altered = JSON.parse(Buffer.from(payload, 'base64url'));
  altered.id = 'another-user';
  assert.equal(readSession(`${Buffer.from(JSON.stringify(altered)).toString('base64url')}.${signature}`, 'visitor'), null);
  assert.equal(passwordMatches('wrong', 'correct'), false);
  assert.equal(passwordMatches('correct', 'correct'), true);
});
test('mutations require the same browser origin', () => {
  assert.throws(() => checkOrigin({ method: 'POST', headers: { host: 'cosmos.test', origin: 'https://evil.test' } }), { status: 403 });
  assert.throws(() => checkOrigin({ method: 'POST', headers: { host: 'cosmos.test', 'sec-fetch-site': 'cross-site' } }), { status: 403 });
  assert.doesNotThrow(() => checkOrigin({ method: 'POST', headers: { host: 'cosmos.test', origin: 'https://cosmos.test' } }));
});
test('media values reject invalid URLs and counter bounds', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com', '/relative']) assert.throws(() => webUrl(value), { status: 400 });
  assert.equal(webUrl('https://example.com/image.png'), 'https://example.com/image.png');
  assert.equal(webUrl(''), null);
  for (const value of [-1, 21, 1.2, NaN, '1']) assert.throws(() => number(value, 0, 20, true), { status: 400 });
});
test('import rejects malformed collections and strips unsafe image URLs', () => {
  assert.throws(() => acceptImportedEntries({ version: 1, entries: [{ title: 'Bad', type: 'OTHER' }] }));
  assert.throws(() => acceptImportedEntries({ version: 1, entries: [{ title: 'Bad', type: 'ANIME', progress: -1 }] }));
  assert.throws(() => acceptImportedEntries({ version: 1, entries: [{ title: 'Bad', type: 'ANIME', totalUnits: 12, progress: 13 }] }));
  const result = acceptImportedEntries({ version: 1, entries: [{ title: 'A story', type: 'MANGA', posterUrl: 'javascript:alert(1)', totalUnits: 20, progress: 5, status: 'IN_PROGRESS', personalScore: 8 }] });
  assert.equal(result[0].posterUrl, null);
  assert.equal(result[0].progress, 5);
  assert.equal(result[0].personalScore, 8);
});
