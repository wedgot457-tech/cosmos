import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
async function edit(path, fn) {
  const url = new URL(path, root);
  const old = await readFile(url, 'utf8');
  await writeFile(url, fn(old));
}
await edit('public/js/app.js', source => {
  let s = source;
  const landings = [...s.matchAll(/function landing\(\) \{\n[^\n]+\n\}/g)];
  if (landings.length > 1) s = s.replace(landings[0][0], '');
  for (const [from, to] of [
    ['YOUR ANIME & MANGA UNIVERSE', 'YOUR ANIME, ALL IN ONE PLACE'],
    ['Find your next<br><em>obsession.</em>', 'Find your next<br><em>favorite story.</em>'],
    ['For the worlds you get lost in.<br>The characters you carry with you.<br>And the stories you haven’t found yet.', 'Keep track of the worlds you love.<br>Make room for the ones you haven’t met yet.<br>Share a little of it with your friends.'],
    ['Explore the universe', 'Explore anime'],
    ['THE JOURNEY IS JUST BEGINNING', 'YOUR STORIES, AT YOUR PACE'],
    ['YOUR CORNER OF THE UNIVERSE', 'YOUR LITTLE CORNER'],
    ['COSMOS selection', 'Nami selection'],
    ['COSMOS collection', 'Nami collection'],
    ['cosmos-library-', 'nami-library-']
  ]) s = s.replaceAll(from, to);
  s = s.replaceAll('COSMOS', 'NAMI');
  return s;
});
await edit('public/js/ui.js', s => s.replaceAll('COSMOS', 'NAMI'));
await edit('public/js/store.js', s => s.replaceAll('cosmos.vanilla.v1', 'nami.library.v1').replaceAll('COSMOS', 'NAMI'));
await edit('server/app.js', s => s.replaceAll('cosmos_admin', 'nami_admin').replaceAll('cosmos_session', 'nami_session').replaceAll('COSMOS', 'Nami'));
await edit('scripts/dev.js', s => s.replaceAll('COSMOS', 'Nami'));
await edit('public/404.html', s => s.replaceAll('COSMOS', 'Nami'));
await edit('package.json', s => JSON.stringify({ ...JSON.parse(s), name: 'nami-anime-library' }, null, 2) + '\n');
await edit('package-lock.json', s => {
  const data = JSON.parse(s);
  data.name = 'nami-anime-library';
  data.packages[''].name = 'nami-anime-library';
  return JSON.stringify(data, null, 2) + '\n';
});
