// Run against an empty, disposable Postgres database: DATABASE_URL=... node tests/api.integration.js
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { handler } from '../server/app.js';
assert.match(new URL(process.env.DATABASE_URL).pathname, /test/, 'Use a test database only');
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
process.env.ADMIN_PASSWORD = randomBytes(24).toString('hex');
const prisma = new PrismaClient();
const server = createServer(handler);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/`;
const jars = { a: '', b: '', admin: '' };
const ids = { users: [], media: [], news: [], schedule: [], trivia: [] };
async function request(path, method = 'GET', data, who = 'a', extra = {}) {
  const response = await fetch(base + path, { method, headers: { Cookie: jars[who] || '', ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: data === undefined ? undefined : JSON.stringify(data) });
  const set = response.headers.getSetCookie();
  for (const line of set) { const pair = line.split(';')[0], key = pair.split('=')[0]; jars[who] = jars[who].split('; ').filter(c => c && !c.startsWith(key + '=')).concat(pair).join('; '); }
  return { status: response.status, body: await response.json() };
}
try {
  const before = await prisma.user.count();
  const signingSecret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  const unconfigured = await request('bootstrap');
  assert.equal(unconfigured.status, 503);
  assert.equal(await prisma.user.count(), before, 'Misconfiguration must not create orphan users');
  process.env.SESSION_SECRET = signingSecret;
  for (const who of ['a', 'b']) { const r = await request('bootstrap', 'GET', undefined, who); assert.equal(r.status, 200); assert.equal(r.body.mode, 'connected'); ids.users.push(r.body.user.id); }
  let r = await request('admin/users'); assert.equal(r.status, 401);
  r = await request('admin/login', 'POST', { password: 'wrong' }, 'admin'); assert.equal(r.status, 401);
  r = await request('admin/login', 'POST', { password: process.env.ADMIN_PASSWORD }, 'admin'); assert.equal(r.status, 200);
  r = await request('admin/users', 'GET', undefined, 'admin'); assert.equal(r.status, 200);
  r = await request('profile', 'PATCH', { username: 'Test_A_' + randomBytes(3).toString('hex') }); assert.equal(r.status, 200);
  r = await request('profile', 'PATCH', { username: 'x' }); assert.equal(r.status, 400);
  r = await request('library', 'POST', { title: 'Integration title', type: 'ANIME', totalUnits: 12, globalRating: 8 });
  assert.equal(r.status, 200); const entry = r.body; ids.media.push(entry.mediaEntryId);
  r = await request(`library/${entry.id}`, 'PATCH', { progress: 3, status: 'IN_PROGRESS', personalScore: 8.5 }); assert.equal(r.status, 200); assert.equal(r.body.progress, 3);
  r = await request(`library/${entry.id}`, 'PATCH', { progress: 13 }); assert.equal(r.status, 400);
  r = await request(`library/${entry.id}`, 'PATCH', { progress: 1 }, 'b'); assert.equal(r.status, 404);
  r = await request(`library/${entry.id}`, 'DELETE', undefined, 'b'); assert.equal(r.status, 404);
  r = await request('profile', 'PATCH', { username: 'Valid' }, 'a', { Origin: 'https://evil.test' }); assert.equal(r.status, 403);
  const posts = await Promise.all([request('comments', 'POST', { entry: entry.id, body: 'A thoughtful comment.' }), request('comments', 'POST', { entry: entry.id, body: 'A concurrent comment.' })]);
  assert.deepEqual(posts.map(r => r.status).sort(), [200, 429]);
  r = await request(`comments?entry=${entry.id}`); assert.equal(r.status, 200); assert.equal(r.body.length, 1); assert.equal(r.body[0].canDelete, true); const comment = r.body[0];
  r = await request('comments', 'DELETE', { id: comment.id }, 'b'); assert.equal(r.status, 403);
  r = await request('comments', 'DELETE', { id: comment.id }); assert.equal(r.status, 200);
  r = await request('admin/users', 'PATCH', { id: ids.users[0], isBanned: true }, 'admin'); assert.equal(r.status, 200);
  for (const [path, method, data] of [['library', 'POST', { title: 'Blocked', type: 'ANIME' }], [`library/${entry.id}`, 'DELETE'], ['profile', 'PATCH', { username: 'Blocked' }]]) { r = await request(path, method, data); assert.equal(r.status, 403); }
  await request('admin/users', 'PATCH', { id: ids.users[0], isBanned: false }, 'admin');
  r = await request('admin/theme', 'PATCH', { colorAccentPrimary: '#aabbcc', heroVideoUrl: 'https://example.com/video.mp4' }, 'admin'); assert.equal(r.status, 200); assert.equal(r.body.colorAccentPrimary, '#aabbcc');
  r = await request('admin/theme', 'PATCH', { colorBase: 'invalid' }, 'admin'); assert.equal(r.status, 400);
  for (const [kind, data] of Object.entries({ news: { tag: 'TEST', headline: 'A test update', imageUrl: '' }, schedule: { dayOfWeek: 1, title: 'A test show', episode: 2, airTime: '21:00 UTC' }, trivia: { tag: 'TEST', fact: 'An integration fixture.' } })) {
    r = await request(`admin/content/${kind}`, 'POST', data, 'admin'); assert.equal(r.status, 200); ids[kind].push(r.body.id);
    r = await request(`admin/content/${kind}`, 'PATCH', { ...data, id: r.body.id }, 'admin'); assert.equal(r.status, 200);
    r = await request(`admin/content/${kind}`, 'GET', undefined, 'admin'); assert.equal(r.status, 200);
    r = await request(`admin/content/${kind}`, 'DELETE', { id: ids[kind][0] }, 'admin'); assert.equal(r.status, 200);
  }
  r = await request('admin/media', 'PATCH', { id: entry.mediaEntryId, title: 'Edited title', type: 'ANIME', totalUnits: 12, globalRating: 9, posterUrl: 'https://example.com/poster.jpg' }, 'admin'); assert.equal(r.status, 200);
  r = await request('bootstrap'); assert.equal(r.body.entries[0].title, 'Edited title');
  r = await request('upload', 'POST', { kind: 'avatar', data: 'invalid' }); assert.equal(r.status, 503);
  r = await request('library', 'POST', { title: 'Bad URL', type: 'ANIME', posterUrl: 'javascript:alert(1)' }); assert.equal(r.status, 400);
  r = await request(`library/${entry.id}`, 'DELETE'); assert.equal(r.status, 200);
  r = await request('admin/users', 'DELETE', { id: ids.users[1] }, 'admin'); assert.equal(r.status, 200);
  r = await request('admin/logout', 'POST', {}, 'admin'); assert.equal(r.status, 200);
  r = await request('admin/users', 'GET', undefined, 'admin'); assert.equal(r.status, 401);
  console.log('PASS: connected bootstrap, auth, library CRUD, ownership, CSRF, comments/cooldown, ban enforcement, profile, theme, content CRUD, catalog editing and logout.');
} finally {
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.mediaEntry.deleteMany({ where: { id: { in: ids.media } } });
  for (const [kind, model] of [['news', 'newsPost'], ['schedule', 'scheduleEntry'], ['trivia', 'triviaFact']]) await prisma[model].deleteMany({ where: { id: { in: ids[kind] } } });
  await prisma.siteTheme.deleteMany({ where: { id: 1 } });
  await prisma.$disconnect();
  await new Promise(resolve => server.close(resolve));
}
