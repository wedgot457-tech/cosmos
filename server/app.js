import { PrismaClient } from '@prisma/client';
import { handleUpload } from '@vercel/blob/client';
import { HttpError, requireValue, text, number, webUrl, signSession, readSession, cookies, setCookie, checkOrigin, jsonBody, newId, passwordMatches } from './security.js';
import { defaultCopy } from '../public/js/data.js';

let client;
const db = () => client ??= new PrismaClient();
let themeCopySchemaReady;
async function ensureThemeCopySchema() {
  // `copy` was added after the first production schema was created. Apply this
  // nullable, idempotent compatibility change using the function's database
  // connection so production secrets never need to leave Vercel.
  themeCopySchemaReady ??= db().$executeRaw`ALTER TABLE "SiteTheme" ADD COLUMN IF NOT EXISTS "copy" JSONB`;
  await themeCopySchemaReady;
}
// Keep anonymous profiles attached to the same device for a long time. The
// signed, HTTP-only cookie is renewed on activity, so the user ID itself never
// needs to be exposed as a client-controlled authentication token.
const DEVICE_SESSION_SECONDS = 60 * 60 * 24 * 365 * 10;
const statuses = ['PLAN_TO_WATCH', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'DROPPED', 'BACKLOG'];
const types = ['ANIME', 'MANGA', 'MANHWA'];
const includeMedia = { mediaEntry: true };
const profile = u => ({ id: u.id, username: u.username, avatarUrl: u.avatarUrl, level: u.level, isBanned: u.isBanned });
const flatten = e => ({ ...e.mediaEntry, mediaEntryId: e.mediaEntryId, id: e.id, progress: e.progress, status: e.status, personalScore: e.personalScore });
const adminId = req => readSession(cookies(req).cosmos_admin, 'admin');
function admin(req) { requireValue(adminId(req) === 'administrator', 'Sign in to the admin panel first.', 401); }
async function visitor(req, res) {
  const id = readSession(cookies(req).cosmos_session, 'visitor');
  if (id) {
    const user = await db().user.findUnique({ where: { id } });
    if (user) {
      requireValue(!user.isBanned, 'This profile has been banned. Contact the site administrator if you think this is a mistake.', 403);
      setCookie(res, 'cosmos_session', signSession(user.id, 'visitor', DEVICE_SESSION_SECONDS), DEVICE_SESSION_SECONDS);
      return user;
    }
  }
  const user = await db().user.create({ data: { id: newId(), username: `Explorer_${newId().replaceAll('-', '').slice(0, 12)}` } });
  setCookie(res, 'cosmos_session', signSession(user.id, 'visitor', DEVICE_SESSION_SECONDS), DEVICE_SESSION_SECONDS);
  return user;
}
function canWrite(user) {
  requireValue(!user.isBanned, 'This profile is banned and cannot access the site.', 403);
  requireValue(!user.isBlocked, 'This profile is temporarily blocked from making changes.', 403);
}
async function recordActivity(userId, action, detail) {
  await db().activity.create({ data: { userId, action, detail: text(detail, 500) } });
}
async function ownedEntry(id, user) {
  const entry = await db().libraryEntry.findFirst({ where: { id, userId: user.id }, include: includeMedia });
  requireValue(entry, 'Entry not found.', 404); return entry;
}
function mediaData(body) {
  requireValue(types.includes(body.type), 'Choose anime, manga, or manhwa.');
  return { title: text(body.title, 200), type: body.type, synopsis: body.synopsis ? text(body.synopsis, 5000) : null,
    posterUrl: webUrl(body.posterUrl), totalUnits: body.totalUnits == null ? null : number(body.totalUnits, 1, 100000, true),
    globalRating: body.globalRating == null ? null : number(body.globalRating, 0, 10),
    anilistId: body.anilistId == null ? null : number(body.anilistId, 1, 100000000, true) };
}
async function catalogSearch(url) {
  const rawSearch = url.searchParams.get('q') || '';
  const search = rawSearch ? text(rawSearch, 100, 2) : null;
  const type = url.searchParams.get('type') || 'ANIME';
  requireValue(['ANIME', 'MANGA', 'MANHWA'].includes(type), 'Choose anime, manga, or manhwa.');
  const page = number(Number(url.searchParams.get('page') || 1), 1, 1000, true);
  const sort = url.searchParams.get('sort') || 'TRENDING_DESC';
  const sorts = ['TRENDING_DESC', 'POPULARITY_DESC', 'SCORE_DESC', 'START_DATE_DESC', 'UPDATED_AT_DESC', 'FAVOURITES_DESC'];
  requireValue(sorts.includes(sort), 'Choose a valid catalog sort.');
  const genres = url.searchParams.getAll('genre').filter(value => /^[A-Za-z &-]{1,30}$/.test(value)).slice(0, 3);
  const format = url.searchParams.get('format') || null;
  requireValue(!format || ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC', 'MANGA', 'NOVEL', 'ONE_SHOT'].includes(format), 'Choose a valid format.');
  const season = url.searchParams.get('season') || null;
  requireValue(!season || ['WINTER', 'SPRING', 'SUMMER', 'FALL'].includes(season), 'Choose a valid season.');
  const seasonYear = url.searchParams.get('year') ? number(Number(url.searchParams.get('year')), 1940, new Date().getFullYear() + 2, true) : null;
  const status = url.searchParams.get('status') || null;
  requireValue(!status || ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'].includes(status), 'Choose a valid release status.');
  requireValue(!(type !== 'ANIME' && (season || seasonYear || status)), 'Season, release year, and airing status filters are for anime.');
  const mediaType = type === 'ANIME' ? 'ANIME' : 'MANGA';
  const variables = { type: mediaType, page, sort: [sort] }, definitions = ['$type:MediaType', '$page:Int', '$sort:[MediaSort]'], args = ['type:$type', 'sort:$sort', 'isAdult:false'];
  if (search) { variables.search = search; definitions.push('$search:String'); args.push('search:$search'); }
  if (genres.length) { variables.genres = genres; definitions.push('$genres:[String]'); args.push('genre_in:$genres'); }
  if (format) { variables.format = format; definitions.push('$format:MediaFormat'); args.push('format_in:$format'); }
  if (season) { variables.season = season; definitions.push('$season:MediaSeason'); args.push('season:$season'); }
  if (seasonYear) { variables.year = seasonYear; definitions.push('$year:Int'); args.push('seasonYear:$year'); }
  if (status) { variables.status = status; definitions.push('$status:MediaStatus'); args.push('status:$status'); }
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `query(${definitions.join(',')}){Page(page:$page,perPage:24){pageInfo{hasNextPage}media(${args.join(',')}){id title{english romaji}coverImage{large}bannerImage description(asHtml:false)episodes chapters averageScore popularity favourites countryOfOrigin genres season seasonYear startDate{year month day}format status}}}`, variables })
  });
  requireValue(response.ok, 'AniList is busy. Try again in a moment or add a title manually.', 502);
  const data = await response.json();
  requireValue(!data.errors, 'AniList could not complete this search.', 502);
  return { page, hasNextPage: data.data?.Page?.pageInfo?.hasNextPage || false, results: (data.data?.Page?.media || []).filter(m => type !== 'MANHWA' || m.countryOfOrigin === 'KR').map(m => ({ anilistId: m.id, title: m.title.english || m.title.romaji, posterUrl: m.coverImage?.large, bannerImage: m.bannerImage, synopsis: (m.description || '').replace(/<[^>]*>/g, ''), totalUnits: m.episodes ?? m.chapters, globalRating: m.averageScore == null ? null : m.averageScore / 10, popularity: m.popularity, favourites: m.favourites, type, genres: m.genres, season: m.season, seasonYear: m.seasonYear, startDate: m.startDate, format: m.format, status: m.status })) };
}
async function seasonCalendar(url) {
  const season = url.searchParams.get('season'), year = number(Number(url.searchParams.get('year')), 2000, new Date().getFullYear() + 2, true);
  requireValue(['WINTER', 'SPRING', 'SUMMER', 'FALL'].includes(season), 'Choose a valid season.');
  const page = number(Number(url.searchParams.get('page') || 1), 1, 100, true);
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'query($season:MediaSeason,$year:Int,$page:Int){Page(page:$page,perPage:24){pageInfo{hasNextPage}media(type:ANIME,season:$season,seasonYear:$year,sort:POPULARITY_DESC,isAdult:false){id title{english romaji}coverImage{large}bannerImage description(asHtml:false)episodes averageScore genres season seasonYear startDate{year month day}format status}}}', variables: { season, year, page } })
  });
  requireValue(response.ok, 'AniList is busy. Try the seasonal calendar again shortly.', 502);
  const data = await response.json(); requireValue(!data.errors, 'AniList could not load this season.', 502);
  return { season, year, page, hasNextPage: data.data?.Page?.pageInfo?.hasNextPage || false, results: (data.data?.Page?.media || []).map(m => ({ anilistId: m.id, title: m.title.english || m.title.romaji, posterUrl: m.coverImage?.large, bannerImage: m.bannerImage, synopsis: (m.description || '').replace(/<[^>]*>/g, ''), totalUnits: m.episodes, globalRating: m.averageScore == null ? null : m.averageScore / 10, type: 'ANIME', genres: m.genres, season: m.season, seasonYear: m.seasonYear, startDate: m.startDate, format: m.format, status: m.status })) };
}
async function upcomingAiring() {
  const now = Math.floor(Date.now() / 1000), until = now + 7 * 24 * 60 * 60;
  const response = await fetch('https://graphql.anilist.co', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query($from:Int,$to:Int){Page(page:1,perPage:50){airingSchedules(airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){airingAt episode media{id title{english romaji}coverImage{large}genres format averageScore}}}}', variables: { from: now, to: until } }) });
  requireValue(response.ok, response.status === 429 ? 'AniList is receiving too many requests. Try again shortly.' : 'The live schedule is temporarily unavailable.', 502);
  const data = await response.json(); requireValue(!data.errors, 'AniList could not load the live schedule.', 502);
  return (data.data?.Page?.airingSchedules || []).map(row => ({ airingAt: row.airingAt, episode: row.episode, media: row.media && { anilistId: row.media.id, title: row.media.title.english || row.media.title.romaji, posterUrl: row.media.coverImage?.large, genres: row.media.genres, format: row.media.format, globalRating: row.media.averageScore == null ? null : row.media.averageScore / 10 } }));
}
async function dispatch(req, res, path, url) {
  const method = req.method;
  if (path === 'calendar' && method === 'GET') return seasonCalendar(url);
  if (path === 'airing' && method === 'GET') return upcomingAiring();
  if (path === 'upload' && method === 'POST') {
    requireValue(process.env.BLOB_READ_WRITE_TOKEN, 'Uploads are not configured.', 503);
    const body = await jsonBody(req);
    const result = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { kind } = JSON.parse(clientPayload || '{}');
        requireValue(['avatar', 'poster', 'hero-video'].includes(kind), 'Invalid upload kind.');
        const user = await visitor(req, res);
        if (kind !== 'avatar') admin(req);
        else canWrite(user);
        const limits = {
          avatar: { prefix: 'avatar/', max: 10 * 1024 * 1024, types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
          poster: { prefix: 'poster/', max: 25 * 1024 * 1024, types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
          'hero-video': { prefix: 'hero-video/', max: 5 * 1024 * 1024 * 1024, types: ['video/mp4', 'video/webm', 'video/quicktime'] }
        }[kind];
        requireValue(pathname.startsWith(limits.prefix), 'Invalid upload destination.');
        return { allowedContentTypes: limits.types, maximumSizeInBytes: limits.max, addRandomSuffix: true };
      }
    });
    return result;
  }
  if (path === 'search' && method === 'GET') return catalogSearch(url);
  if (path === 'bootstrap' && method === 'GET' && !process.env.DATABASE_URL) return { mode: 'local' };
  if (path === 'community' && method === 'GET' && !process.env.DATABASE_URL) return { comments: [], rankings: [] };
  requireValue(process.env.DATABASE_URL, 'This feature needs a connected database. Personal tracking is available on this browser.', 503);
  requireValue(process.env.SESSION_SECRET?.length >= 32, 'The site owner needs to configure SESSION_SECRET (at least 32 characters).', 503);
  if (path === 'bootstrap' && method === 'GET') {
    await ensureThemeCopySchema();
    const user = await visitor(req, res);
    const [entries, theme, news, schedule, trivia] = await Promise.all([
      db().libraryEntry.findMany({ where: { userId: user.id }, include: includeMedia, orderBy: { updatedAt: 'desc' } }),
      db().siteTheme.findUnique({ where: { id: 1 } }), db().newsPost.findMany({ orderBy: { createdAt: 'desc' } }), db().scheduleEntry.findMany({ orderBy: { airTime: 'asc' } }), db().triviaFact.findMany()
    ]);
    return { mode: 'connected', user: profile(user), entries: entries.map(flatten), theme, news, schedule, trivia, admin: adminId(req) === 'administrator', uploads: !!process.env.BLOB_READ_WRITE_TOKEN };
  }
  if (path === 'community' && method === 'GET') {
    await visitor(req, res);
    const [comments, scoreGroups] = await Promise.all([
      db().comment.findMany({
        include: { user: { select: { username: true, avatarUrl: true } }, libraryEntry: { include: { mediaEntry: true } } },
        orderBy: { createdAt: 'desc' }, take: 8
      }),
      db().libraryEntry.groupBy({
        by: ['mediaEntryId'], where: { personalScore: { not: null } },
        _avg: { personalScore: true }, _count: { personalScore: true },
        orderBy: [{ _avg: { personalScore: 'desc' } }, { _count: { personalScore: 'desc' } }], take: 6
      })
    ]);
    const media = scoreGroups.length ? await db().mediaEntry.findMany({ where: { id: { in: scoreGroups.map(group => group.mediaEntryId) } } }) : [];
    const mediaById = new Map(media.map(item => [item.id, item]));
    return {
      comments: comments.map(comment => ({
        id: comment.id, body: comment.body, createdAt: comment.createdAt, user: comment.user,
        title: comment.libraryEntry.mediaEntry.title, posterUrl: comment.libraryEntry.mediaEntry.posterUrl,
        personalScore: comment.libraryEntry.personalScore
      })),
      rankings: scoreGroups.flatMap(group => {
        const item = mediaById.get(group.mediaEntryId);
        return item ? [{ title: item.title, posterUrl: item.posterUrl, score: group._avg.personalScore, ratingCount: group._count.personalScore, episodes: item.totalUnits }] : [];
      })
    };
  }
  if (path === 'admin/login' && method === 'POST') {
    requireValue(process.env.ADMIN_PASSWORD?.length >= 12, 'The site owner needs to set an ADMIN_PASSWORD of at least 12 characters.', 503);
    const body = await jsonBody(req);
    // A fixed delay makes automated guesses more expensive without storing state in a function.
    await new Promise(resolve => setTimeout(resolve, 400));
    requireValue(passwordMatches(body.password, process.env.ADMIN_PASSWORD), 'Incorrect password.', 401);
    setCookie(res, 'cosmos_admin', signSession('administrator', 'admin', 28800), 28800); return { ok: true };
  }
  if (path === 'admin/logout' && method === 'POST') { setCookie(res, 'cosmos_admin', '', 0); return { ok: true }; }
  if (path.startsWith('admin/')) {
    admin(req);
    if (path === 'admin/theme' && method === 'PATCH') {
      const body = await jsonBody(req), data = {};
      for (const field of ['colorBase', 'colorSurface', 'colorAccentPrimary', 'colorAccentSecondary', 'colorAccentTertiary']) {
        if (body[field] !== undefined) { requireValue(/^#[0-9a-f]{6}$/i.test(body[field]), 'Use a six-digit hex color.'); data[field] = body[field]; }
      }
      if ('heroVideoUrl' in body) data.heroVideoUrl = webUrl(body.heroVideoUrl);
      if ('copy' in body) {
        const allowed = new Set(Object.keys(defaultCopy));
        requireValue(body.copy && typeof body.copy === 'object' && !Array.isArray(body.copy), 'Invalid website copy.');
        const copy = {};
        for (const [key, value] of Object.entries(body.copy)) { requireValue(allowed.has(key), 'Unknown copy field.'); copy[key] = text(value, 300); }
        data.copy = copy;
      }
      return db().siteTheme.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    }
    if (path === 'admin/users') {
      if (method === 'GET') {
        const users = await db().user.findMany({ select: { id: true, username: true, avatarUrl: true, isBanned: true, isBlocked: true, banReason: true, blockReason: true, createdAt: true, _count: { select: { libraryEntries: true, comments: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
        return Promise.all(users.map(async user => ({ ...user, lastActivity: await db().activity.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { action: true, detail: true, createdAt: true } }) })));
      }
      const body = await jsonBody(req), id = text(body.id);
      if (method === 'DELETE') { await db().user.delete({ where: { id } }); return { ok: true }; }
      if (method === 'PATCH') {
        const banning = typeof body.isBanned === 'boolean', blocking = typeof body.isBlocked === 'boolean';
        requireValue(banning !== blocking, 'Choose exactly one moderation action.');
        const user = await db().user.findUniqueOrThrow({ where: { id } });
        const action = banning ? (body.isBanned ? 'banned' : 'unbanned') : (body.isBlocked ? 'blocked' : 'unblocked');
        const reason = body.reason == null || body.reason === '' ? null : text(body.reason, 500);
        const data = banning
          ? { isBanned: body.isBanned, banReason: body.isBanned ? reason : null }
          : { isBlocked: body.isBlocked, blockReason: body.isBlocked ? reason : null };
        await db().user.update({ where: { id }, data });
        await db().adminAuditLog.create({ data: { adminId: adminId(req), targetUserId: id, targetUsername: user.username, action, reason } });
        return { ok: true };
      }
    }
    if (path.startsWith('admin/users/') && path.endsWith('/activity') && method === 'GET') {
      const id = path.slice('admin/users/'.length, -'/activity'.length);
      const user = await db().user.findUniqueOrThrow({ where: { id }, select: { id: true, username: true } });
      const [activity, moderation] = await Promise.all([
        db().activity.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
        db().adminAuditLog.findMany({ where: { targetUserId: id }, orderBy: { createdAt: 'desc' }, take: 50 })
      ]);
      return { user, activity, moderation };
    }
    if (path === 'admin/audit' && method === 'GET') return db().adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    if (path === 'admin/media') {
      if (method === 'GET') return db().mediaEntry.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 });
      if (method === 'PATCH') {
        const body = await jsonBody(req), data = mediaData(body); delete data.anilistId;
        return db().mediaEntry.update({ where: { id: text(body.id) }, data });
      }
    }
    const kind = path.split('/')[2], models = { news: 'newsPost', schedule: 'scheduleEntry', trivia: 'triviaFact' };
    if (path.startsWith('admin/content/') && Object.hasOwn(models, kind)) {
      const model = db()[models[kind]];
      if (method === 'GET') return model.findMany();
      const body = await jsonBody(req);
      if (method === 'DELETE') { await model.delete({ where: { id: text(body.id) } }); return { ok: true }; }
      const data = kind === 'news' ? { tag: text(body.tag, 40), headline: text(body.headline, 240), imageUrl: webUrl(body.imageUrl) }
        : kind === 'schedule' ? { dayOfWeek: number(body.dayOfWeek, 0, 6, true), title: text(body.title, 200), episode: number(body.episode, 1, 100000, true), airTime: text(body.airTime, 60) }
        : { tag: text(body.tag, 40), fact: text(body.fact, 1000) };
      if (method === 'POST') return model.create({ data });
      if (method === 'PATCH') return model.update({ where: { id: text(body.id) }, data });
    }
    throw new HttpError(404, 'Admin endpoint not found.');
  }
  const user = await visitor(req, res);
  if (method !== 'GET') canWrite(user);
  if (path === 'profile' && method === 'PATCH') {
    const body = await jsonBody(req);
    const updated = await db().user.update({ where: { id: user.id }, data: { username: text(body.username, 24, 2), ...('avatarUrl' in body ? { avatarUrl: webUrl(body.avatarUrl) } : {}) } });
    await recordActivity(user.id, 'profile_updated', 'Updated profile details');
    return profile(updated);
  }
  if (path === 'library' && method === 'POST') {
    const body = await jsonBody(req), data = mediaData(body);
    const media = data.anilistId ? await db().mediaEntry.upsert({ where: { anilistId: data.anilistId }, update: { anilistId: data.anilistId }, create: data }) : await db().mediaEntry.create({ data });
    const existing = await db().libraryEntry.findUnique({ where: { userId_mediaEntryId: { userId: user.id, mediaEntryId: media.id } } });
    const entry = flatten(await db().libraryEntry.upsert({ where: { userId_mediaEntryId: { userId: user.id, mediaEntryId: media.id } }, update: { mediaEntryId: media.id }, create: { userId: user.id, mediaEntryId: media.id }, include: includeMedia }));
    if (!existing) await recordActivity(user.id, 'anime_added', `Added ${entry.title} to the library`);
    return entry;
  }
  if (path.startsWith('library/')) {
    const id = path.slice(8), entry = await ownedEntry(id, user);
    if (method === 'DELETE') { await db().libraryEntry.delete({ where: { id } }); await recordActivity(user.id, 'anime_removed', `Removed ${entry.mediaEntry.title} from the library`); return { ok: true }; }
    if (method === 'PATCH') {
      const body = await jsonBody(req), data = {};
      if ('progress' in body) data.progress = number(body.progress, 0, entry.mediaEntry.totalUnits ?? 100000, true);
      if ('personalScore' in body) data.personalScore = body.personalScore == null ? null : number(body.personalScore, 0, 10);
      if ('status' in body) { requireValue(statuses.includes(body.status), 'Invalid status.'); data.status = body.status; }
      const updated = flatten(await db().libraryEntry.update({ where: { id }, data, include: includeMedia }));
      if (Object.keys(data).length) await recordActivity(user.id, data.personalScore !== undefined ? 'rating_updated' : 'library_updated', `Updated ${updated.title}: ${updated.status.replaceAll('_', ' ').toLowerCase()} · ${updated.personalScore == null ? 'unrated' : updated.personalScore + '/10'}`);
      return updated;
    }
  }
  if (path === 'comments') {
    if (method === 'GET') {
      const entry = await ownedEntry(text(url.searchParams.get('entry')), user);
      const rows = await db().comment.findMany({ where: { libraryEntry: { mediaEntryId: entry.mediaEntryId } }, include: { user: { select: { username: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' }, take: 200 });
      return rows.map(({ userId, ...c }) => ({ ...c, canDelete: userId === user.id || adminId(req) === 'administrator' }));
    }
    const body = await jsonBody(req);
    if (method === 'DELETE') {
      const comment = await db().comment.findUnique({ where: { id: text(body.id) } });
      requireValue(comment && (comment.userId === user.id || adminId(req) === 'administrator'), 'You cannot delete this comment.', 403);
      await db().comment.delete({ where: { id: comment.id } }); return { ok: true };
    }
    if (method === 'POST') {
      const entry = await ownedEntry(text(body.entry), user), content = text(body.body, 1000);
      // Serialize each visitor's comments so parallel requests cannot bypass the cooldown.
      await db().$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
        const recent = await tx.comment.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
        requireValue(!recent || Date.now() - recent.createdAt.getTime() >= 10000, 'Please wait 10 seconds between comments.', 429);
        await tx.comment.create({ data: { userId: user.id, libraryEntryId: entry.id, body: content } });
      }); await recordActivity(user.id, 'comment_posted', `Commented on ${entry.mediaEntry.title}`); return { ok: true };
    }
  }
  throw new HttpError(404, 'Endpoint not found.');
}
export async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    checkOrigin(req);
    const url = new URL(req.url, 'http://localhost'), path = url.searchParams.get('path') || url.pathname.replace(/^\/api\//, '');
    const result = await dispatch(req, res, path, url);
    res.statusCode = 200; res.end(JSON.stringify(result));
  } catch (error) {
    const conflict = error.code === 'P2002';
    const status = error.status || (conflict ? 409 : error.code === 'P2025' ? 404 : 500);
    res.statusCode = status;
    if (status >= 500) console.error('Cosmos request failed:', error.code || error.name);
    res.end(JSON.stringify({ error: conflict ? 'That name or entry already exists.' : status === 404 ? 'Not found.' : error.status ? error.message : 'The server could not complete this request. Check the database connection and schema, then retry.' }));
  }
}
