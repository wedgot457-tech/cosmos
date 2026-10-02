import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['public/js', 'server', 'api', 'scripts', 'tests']) {
  for (const file of await readdir(dir)) if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
if (config.outputDirectory !== 'public') throw new Error('Vercel must publish public/');
for (const file of ['public/index.html', 'public/styles.css', 'public/js/app.js', 'public/js/blob-upload.js', 'api/gateway.js']) await readFile(file);
console.log('JavaScript syntax and deployable entry points verified.');
