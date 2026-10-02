import { defaultTheme, defaultCopy, editorial, sampleSchedule, facts } from './data.js';
const KEY = 'cosmos.library.v1';
export let state;
export let mode;
export async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/${path}`, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unexpected response. Please retry.'); }
  if (!response.ok) throw new Error(data.error || 'Could not save. Please retry.');
  return data;
}
function fresh() {
  return { user: { id: crypto.randomUUID(), username: 'Explorer', avatarUrl: null, level: 1 }, entries: [], comments: [], theme: { ...defaultTheme }, news: structuredClone(editorial), schedule: structuredClone(sampleSchedule), trivia: structuredClone(facts) };
}
function save(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { throw new Error('Browser storage is full or unavailable. Export your library before clearing space.'); }
  state = next;
}
export async function load() {
  const data = await api('bootstrap');
  mode = data.mode;
  if (mode === 'connected') { state = { ...data, theme: { ...defaultTheme, ...(data.theme || {}), copy: { ...defaultCopy, ...(data.theme?.copy || {}) } } }; return; }
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); state = saved && Array.isArray(saved.entries) && saved.user && Array.isArray(saved.comments) ? { ...fresh(), ...saved } : fresh(); }
  catch { state = fresh(); }
  save(state);
}
export async function addEntry(media) {
  if (state.user.isBanned) throw new Error('Your account cannot make changes.');
  let entry;
  if (mode === 'connected') {
    const payload = { ...media, posterUrl: media.sourcePosterUrl || media.posterUrl };
    entry = await api('library', 'POST', payload);
    state.entries = [entry, ...state.entries.filter(e => e.id !== entry.id)];
  } else {
    const existing = state.entries.find(e => media.anilistId && e.anilistId === media.anilistId);
    if (existing) return existing;
    entry = { ...media, id: crypto.randomUUID(), progress: 0, personalScore: null, status: 'PLAN_TO_WATCH' };
    save({ ...state, entries: [entry, ...state.entries] });
  }
  return entry;
}
export async function updateEntry(id, changes) {
  const current = state.entries.find(e => e.id === id);
  if (!current) throw new Error('This entry no longer exists.');
  const updated = mode === 'connected' ? await api(`library/${id}`, 'PATCH', changes) : { ...current, ...changes };
  const next = { ...state, entries: state.entries.map(e => e.id === id ? updated : e) };
  if (mode === 'local') save(next); else state = next;
  return updated;
}
export async function removeEntry(id) {
  if (mode === 'connected') await api(`library/${id}`, 'DELETE');
  const next = { ...state, entries: state.entries.filter(e => e.id !== id), comments: (state.comments || []).filter(c => c.entry !== id) };
  if (mode === 'local') save(next); else state = next;
}
export async function updateProfile(data) {
  if (typeof data.username !== 'string' || data.username.trim().length < 2 || data.username.trim().length > 24) throw new Error('Use a display name between 2 and 24 characters.');
  const next = { ...state, user: mode === 'connected' ? await api('profile', 'PATCH', data) : { ...state.user, ...data } };
  if (mode === 'local') save(next); else state = next;
}
export async function upload(file, kind, onProgress = () => {}) {
  const limits = { avatar: 10 * 1024 * 1024, poster: 25 * 1024 * 1024, 'hero-video': 5 * 1024 * 1024 * 1024 };
  const types = kind === 'hero-video' ? ['video/mp4', 'video/webm', 'video/quicktime'] : ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!types.includes(file.type)) throw new Error(kind === 'hero-video' ? 'Choose an MP4, WebM, or QuickTime video.' : 'Choose a PNG, JPEG, WebP, or GIF image.');
  if (!limits[kind] || file.size > limits[kind]) throw new Error(kind === 'hero-video' ? 'Landing videos must be 5 GB or smaller.' : `Images must be ${kind === 'avatar' ? '10' : '25'} MB or smaller.`);
  if (mode === 'local') {
    if (file.size > 2 * 1024 * 1024) throw new Error('Large uploads need the connected Cosmos Blob storage.');
    return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(file); });
  }
  if (typeof window.cosmosBlobUpload !== 'function') throw new Error('The secure upload client did not load. Refresh and try again.');
  try {
    const blob = await window.cosmosBlobUpload(file, kind, onProgress);
    return blob.url;
  } catch (error) {
    throw new Error(error.message || 'Upload failed. Please try again.');
  }
}
export async function comments(entry) {
  return mode === 'connected' ? api(`comments?entry=${encodeURIComponent(entry)}`) : state.comments.filter(c => c.entry === entry).map(c => ({ ...c, user: state.user, canDelete: true }));
}
export async function postComment(entry, body) {
  if (typeof body !== 'string' || !body.trim() || body.length > 1000) throw new Error('Write between 1 and 1,000 characters.');
  if (mode === 'connected') return api('comments', 'POST', { entry, body });
  const recent = state.comments.at(-1);
  if (recent && Date.now() - new Date(recent.createdAt).getTime() < 10000) throw new Error('Please wait 10 seconds between notes.');
  save({ ...state, comments: [...state.comments, { id: crypto.randomUUID(), entry, body, createdAt: new Date().toISOString() }] });
}
export async function deleteComment(id) {
  if (mode === 'connected') return api('comments', 'DELETE', { id });
  save({ ...state, comments: state.comments.filter(c => c.id !== id) });
}
export async function saveTheme(theme) {
  const next = { ...state, theme: mode === 'connected' ? await api('admin/theme', 'PATCH', theme) : theme };
  if (mode === 'local') save(next); else state = next;
}
export function exportLibrary() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: { username: state.user.username, avatarUrl: state.user.avatarUrl || null },
    entries: state.entries.map(({ id, mediaEntryId, ...entry }) => entry)
  }, null, 2);
}
export function acceptImportedEntries(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 200) throw new Error('Choose a COSMOS export with up to 200 entries.');
  return value.entries.map(e => {
    if (!e || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 200 || !['ANIME', 'MANGA', 'MANHWA'].includes(e.type)) throw new Error('The export contains an invalid title or media type.');
    const total = e.totalUnits == null ? null : Number(e.totalUnits);
    if (total !== null && (!Number.isInteger(total) || total < 1 || total > 100000)) throw new Error('The export contains an invalid total.');
    const progress = Number(e.progress || 0);
    if (!Number.isInteger(progress) || progress < 0 || progress > (total ?? 100000)) throw new Error('The export contains invalid progress.');
    const safeImage = url => typeof url === 'string' && (/^https:\/\//.test(url) || /^\/assets\/[a-z0-9.-]+$/i.test(url)) ? url : null;
    const score = v => v == null ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10 ? v : null;
    return { title: e.title.trim(), type: e.type, synopsis: typeof e.synopsis === 'string' ? e.synopsis.slice(0, 5000) : '', totalUnits: total, progress, status: ['PLAN_TO_WATCH', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'DROPPED', 'BACKLOG'].includes(e.status) ? e.status : 'PLAN_TO_WATCH', personalScore: score(e.personalScore), globalRating: score(e.globalRating), posterUrl: safeImage(e.posterUrl), sourcePosterUrl: safeImage(e.sourcePosterUrl), anilistId: Number.isInteger(e.anilistId) && e.anilistId > 0 && e.anilistId <= 100000000 ? e.anilistId : null };
  });
}
export async function importLibrary(value) {
  const entries = acceptImportedEntries(value);
  if (mode === 'local') {
    const next = structuredClone(state);
    for (const e of entries) {
      const index = next.entries.findIndex(x => e.anilistId ? x.anilistId === e.anilistId : x.title === e.title && x.type === e.type);
      if (index < 0) next.entries.push({ ...e, id: crypto.randomUUID() });
    }
    save(next); return;
  }
  let count = 0;
  try {
    for (const e of entries) {
      const found = state.entries.find(x => e.anilistId ? x.anilistId === e.anilistId : x.title === e.title && x.type === e.type);
      if (found) continue;
      const added = await addEntry(e);
      await updateEntry(added.id, { progress: e.progress, status: e.status, personalScore: e.personalScore }); count++;
    }
  } catch (error) { throw new Error(`Imported ${count} entries before stopping. ${error.message} Existing entries were kept; retry to continue.`); }
}
