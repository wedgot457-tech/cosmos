import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { handler } from '../server/app.js';
const root = resolve('public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) return handler(req, res);
  try {
    const file = resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); return res.end(); }
    let content, extension = extname(file);
    try { content = await readFile(file); } catch {
      if (extension) { res.writeHead(404); return res.end('Not found'); }
      content = await readFile(resolve(root, 'index.html')); extension = '.html';
    }
    res.setHeader('Content-Type', `${types[extension] || 'application/octet-stream'}; charset=utf-8`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(content);
  } catch { res.writeHead(400); res.end('Bad request'); }
}).listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log(`Cosmos ready at http://localhost:${process.env.PORT || 3001}`));
