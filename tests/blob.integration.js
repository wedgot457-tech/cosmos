// Local-only Blob SDK verification. Start the documented Vercel emulator on port 4000.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { del } from '@vercel/blob';
import { handler } from '../server/app.js';
assert.match(new URL(process.env.DATABASE_URL).pathname, /test/);
process.env.VERCEL_BLOB_API_URL = 'http://localhost:4000/api/blob';
process.env.BLOB_READ_WRITE_TOKEN = `vercel_blob_rw_cosmostest_${randomBytes(20).toString('hex')}`;
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
const prisma = new PrismaClient();
const server = createServer(handler);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/`;
let userId, blobUrl;
try {
  const boot = await fetch(base + 'bootstrap');
  const cookie = boot.headers.get('set-cookie').split(';')[0];
  userId = (await boot.json()).user.id;
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvFkAAAAASUVORK5CYII=';
  const upload = await fetch(base + 'upload', {method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({kind:'avatar',data:image})});
  const result = await upload.json();
  assert.equal(upload.status,200,JSON.stringify(result)); blobUrl=result.url;
  assert.equal((await fetch(blobUrl)).status,200);
  assert.equal((await prisma.user.findUnique({where:{id:userId}})).avatarUrl,blobUrl);
  for (const [kind,data,expected] of [['poster',image,401],['avatar','data:image/svg+xml;base64,PHN2Zz4=',400],['avatar','data:image/png;base64,'+Buffer.alloc(2_000_001).toString('base64'),413]]) {
    const r=await fetch(base+'upload',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({kind,data})});assert.equal(r.status,expected);
  }
  console.log('PASS: Blob SDK avatar upload, byte retrieval, database persistence, poster authorization, SVG rejection and size limit.');
} finally {
  if (blobUrl) await del(blobUrl);
  if (userId) await prisma.user.delete({where:{id:userId}});
  await prisma.$disconnect();await new Promise(resolve=>server.close(resolve));
}
