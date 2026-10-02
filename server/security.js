import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function text(value, max = 200, min = 1) {
  requireValue(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, `Enter between ${min} and ${max} characters.`);
  return value.trim();
}
export function number(value, min, max, integer = false) {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)), `Enter a ${integer ? 'whole ' : ''}number from ${min} to ${max}.`);
  return value;
}
export function webUrl(value) {
  if (value == null || value === '') return null;
  requireValue(typeof value === 'string' && value.length <= 2048, 'Invalid URL.');
  let parsed;
  try { parsed = new URL(value); } catch { throw new HttpError(400, 'Enter a complete HTTPS URL.'); }
  requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password, 'Use an HTTPS URL without credentials.');
  return parsed.href;
}
function key() {
  const secret = process.env.SESSION_SECRET;
  requireValue(typeof secret === 'string' && secret.length >= 32, 'The site owner needs to configure SESSION_SECRET (at least 32 characters).', 503);
  return secret;
}
export function signSession(id, purpose, seconds) {
  const body = Buffer.from(JSON.stringify({ id, purpose, exp: Date.now() + seconds * 1000 })).toString('base64url');
  return `${body}.${createHmac('sha256', key()).update(body).digest('base64url')}`;
}
export function readSession(token, purpose) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', key()).update(body).digest('base64url');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.purpose === purpose && data.exp > Date.now() && typeof data.id === 'string' ? data.id : null;
  } catch { return null; }
}
export function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(p => p.trim().split(/=(.*)/s).slice(0, 2)).filter(p => p.length === 2));
}
export function setCookie(res, name, token, seconds) {
  const previous = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : [previous]), `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`]);
}
export function checkOrigin(req) {
  if (['GET', 'HEAD'].includes(req.method)) return;
  requireValue(req.headers['sec-fetch-site'] !== 'cross-site', 'Cross-site request rejected.', 403);
  if (req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { throw new HttpError(403, 'Invalid request origin.'); }
    requireValue(origin.host === req.headers.host, 'Cross-site request rejected.', 403);
  }
}
export async function jsonBody(req) {
  requireValue((req.headers['content-type'] || '').includes('application/json'), 'Expected JSON.', 415);
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    requireValue(JSON.stringify(req.body).length < 3_000_000, 'Request is too large.', 413);
    return req.body;
  }
  let body = typeof req.body === 'string' ? req.body : '';
  if (!body) for await (const chunk of req) {
    body += chunk;
    requireValue(body.length < 3_000_000, 'Request is too large.', 413);
  }
  try { const parsed = JSON.parse(body); requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'Expected an object.'); return parsed; }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
}
export const newId = randomUUID;
export function passwordMatches(input, expected) {
  if (typeof input !== 'string' || !expected) return false;
  const a = createHmac('sha256', key()).update(input).digest();
  const b = createHmac('sha256', key()).update(expected).digest();
  return timingSafeEqual(a, b);
}
