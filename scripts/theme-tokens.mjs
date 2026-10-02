import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const target = new URL('public/styles.css', root);
let css = await readFile(target, 'utf8');
for (const [from, to] of [
  ['#baff680a', 'color-mix(in srgb,var(--accent) 4%,transparent)'],
  ['#baff6810', 'color-mix(in srgb,var(--accent) 6%,transparent)'],
  ['#baff6812', 'color-mix(in srgb,var(--accent) 7%,transparent)'],
  ['#baff6815', 'color-mix(in srgb,var(--accent) 8%,transparent)'],
  ['#baff6820', 'color-mix(in srgb,var(--accent) 12%,transparent)'],
  ['#baff6830', 'color-mix(in srgb,var(--accent) 18%,transparent)'],
  ['#baff6860', 'color-mix(in srgb,var(--accent) 38%,transparent)'],
  ['#baff68', 'var(--accent)'],
  ['#65d6c0', 'var(--secondary)'],
  ['#b9a5ef', 'var(--tertiary)']
]) css = css.replaceAll(from, to);
await writeFile(target, css);
