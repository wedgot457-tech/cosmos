import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const target = new URL('public/js/app.js', root);
let s = await readFile(target, 'utf8');
const from = '<span class="level-tag">EXPLORER · LVL ${user.level}</span><h2>${esc(user.username)}</h2><p>';
const to = '<span class="level-tag">YOUR PROFILE</span><h2>${esc(user.username)}</h2><p class="profile-id">PROFILE ID · <code>${esc(user.id)}</code></p><p>';
if (!s.includes(from)) throw new Error('Profile card did not match expected text');
s = s.replace(from, to);
await writeFile(target, s);
