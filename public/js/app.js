import * as store from './store.js';
import { picks } from './catalog.js';
import { statusLabels, days, defaultTheme, editorial } from './data.js';
import { esc, imageUrl, icon, empty, field, select, toast, openDialog } from './ui.js';

const main = document.querySelector('#main');
const modal = document.querySelector('#modal');
const filters = { type: 'ALL', status: 'ALL', query: '', view: 'grid', sort: 'recent' };
const currentMonth = new Date().getMonth();
const currentSeason = currentMonth < 2 ? 'WINTER' : currentMonth < 5 ? 'SPRING' : currentMonth < 8 ? 'SUMMER' : currentMonth < 11 ? 'FALL' : 'WINTER';
let activeDay = (new Date().getDay() + 6) % 7, factIndex = 0, searchResults = [], modalSearchResults = [], discoverQuery = '', discoverType = 'ANIME', discoverFilters = { sort: 'TRENDING_DESC', genre: '', format: '', season: '', year: '', status: '' }, discoverPage = 1, discoverHasNext = false, discoverLoading = false, airingRows = [], airingLoaded = false, airingError = '', seasonRows = [], season = currentSeason, seasonYear = new Date().getFullYear() + (currentMonth === 11 ? 1 : 0), seasonPage = 1, seasonHasNext = false, adminRows = [], commentRows = [], homeCommunity = { comments: [], rankings: [] }, navVersion = 0;
const typeLabels = { ANIME: 'Anime', MANGA: 'Manga', MANHWA: 'Manhwa' };
const copyText = (key, fallback) => store.state.theme.copy?.[key] || fallback;
const addButton = '<a class="button primary" href="/discover">' + icon('search', 17) + ' Explore anime</a>';
const getEntry = id => store.state.entries.find(e => e.id === id);
const totalProgress = () => store.state.entries.reduce((n, e) => n + e.progress, 0);
const avatar = () => store.state.user.avatarUrl ? `<img src="${esc(imageUrl(store.state.user.avatarUrl))}" alt="">` : icon('user', 20);
const pageHead = (eyebrow, title, subtitle, action = '') => {
  const copy = store.state?.theme?.copy || {};
  const titleKeys = { 'YOUR PERSONAL COLLECTION':['libraryEyebrow','libraryTitle','librarySubtitle'], 'YOUR LITTLE CORNER':['profileEyebrow','profileTitle','profileSubtitle'] };
  const keys = titleKeys[eyebrow];
  if (keys?.[0]) [eyebrow, title, subtitle] = keys.map((key, index) => copy[key] || [eyebrow, title, subtitle][index]);
  return `<div class="page-heading"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</div>`;
};
function updateVideoAudioButton(button, muted) {
  if (!button) return;
  button.classList.toggle('is-muted', muted);
  button.setAttribute('aria-pressed', String(!muted));
  button.setAttribute('aria-label', muted ? 'Enable background video sound' : 'Mute background video');
  button.innerHTML = `${icon(muted ? 'volumeOff' : 'volume', 16)}<span>${muted ? 'Enable sound' : 'Sound on'}</span>`;
}
async function startBackgroundVideo() {
  const video = document.querySelector('[data-background-video]');
  if (!video) return;
  const button = document.querySelector('[data-video-audio]');
  video.volume = 0.7;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.pause();
    video.muted = true;
    updateVideoAudioButton(button, true);
    return;
  }
  video.muted = false;
  updateVideoAudioButton(button, false);
  try {
    await video.play();
  } catch {
    // Browsers commonly block audible autoplay. Keep video moving silently,
    // then let the visible sound control retry from a user gesture.
    video.muted = true;
    updateVideoAudioButton(button, true);
    try { await video.play(); } catch { /* The sound control can retry playback. */ }
  }
}
function applyTheme() {
  const theme = store.state.theme;
  for (const [key, variable] of Object.entries({ colorBase: '--base', colorSurface: '--surface', colorAccentPrimary: '--accent', colorAccentSecondary: '--secondary', colorAccentTertiary: '--tertiary' })) {
    document.documentElement.style.setProperty(variable, /^#[0-9a-f]{6}$/i.test(theme[key]) ? theme[key] : defaultTheme[key]);
  }
}
function chrome() {
  const path = location.pathname;
  document.querySelector('#header').innerHTML = `<div class="nav-shell"><a class="brand" href="/" data-action="welcome" aria-label="Return to Cosmos entrance"><img src="/assets/mark.svg" alt="" width="36" height="36"><span>COSMOS<span class="brand-dot">.</span></span></a><nav aria-label="Main navigation">${[['/', 'Home'], ['/discover', 'Discover'], ['/rating-hub', 'My library'], ['/schedule', 'Calendar']].map(([url, label]) => `<a href="${url}" ${url === '/' ? 'data-action="welcome"' : ''} ${path === url ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div class="nav-actions"><a class="icon-button nav-search" href="/discover" aria-label="Discover anime and manga">${icon('search')}</a><span class="nav-divider"></span><a href="/profile" class="avatar" aria-label="Your profile">${avatar()}</a></div></div>`;
  document.querySelector('#footer').innerHTML = `<div class="footer-main"><a class="brand" href="/"><img src="/assets/mark.svg" width="28" height="28" alt="">COSMOS.</a><p>A little home for the stories you love.</p><div><a href="/profile">Your profile</a><a href="/admin">Admin</a><a href="https://anilist.co" target="_blank" rel="noopener noreferrer">Anime data by AniList ↗</a></div></div><div class="footer-bottom"><span>MADE FOR THE STORIES THAT STAY WITH YOU.</span><span class="mode-indicator"><i></i>${store.mode === 'local' ? 'Saved on this browser' : 'Shared with your circle'}</span></div>`;
  const dock = document.querySelector('#bottom-nav');
  if (dock) dock.innerHTML = `<div class="dock-shell">${[['/', 'Home', 'sparkle'], ['/discover', 'Explore', 'search'], ['/schedule', 'Calendar', 'calendar'], ['/rating-hub', 'Library', 'book'], ['/profile', 'You', 'user']].map(([url, label, glyph]) => `<a href="${url}" class="dock-link ${path === url ? 'active' : ''}" ${url === '/' ? 'data-action="welcome"' : ''} ${path === url ? 'aria-current="page"' : ''}>${icon(glyph, 19)}<span>${label}</span></a>`).join('')}</div>`;
}
function landing() {
  const video = store.state.theme.heroVideoUrl && /^https:\/\//i.test(store.state.theme.heroVideoUrl);
  return `<section class="landing"><div class="landing-art">${video ? `<video data-background-video src="${esc(store.state.theme.heroVideoUrl)}" autoplay loop playsinline poster="/assets/hero.svg" aria-hidden="true"></video>` : '<img src="/assets/hero.svg" alt="" aria-hidden="true">'}</div>${video ? `<button class="video-audio landing-audio" data-action="video-audio" data-video-audio aria-pressed="false" aria-label="Mute background video">${icon('volume', 16)}<span>Sound on</span></button>` : ''}<div class="landing-shade"></div><div class="landing-copy"><span class="landing-kicker"><i></i> ${esc(copyText('landingEyebrow','A LITTLE HOME FOR YOUR ANIME LIFE'))}</span><a class="landing-mark" aria-label="Cosmos"><img src="/assets/mark.svg" alt=""><span>COSMOS</span></a><h1>${esc(copyText('landingTitleFirst','Your next story'))}<br><em>${esc(copyText('landingTitleSecond','closer than you think.'))}</em></h1><p>${esc(copyText('landingSubtitle','Keep the stories you love. Find new ones together.'))}</p><button class="button primary enter-button" data-action="enter">${esc(copyText('landingEnter','Enter Cosmos'))} <span aria-hidden="true">↗</span></button><small>${esc(copyText('landingFootnote','YOUR WATCHLIST · YOUR PEOPLE · YOUR PACE'))}</small></div><div class="landing-note">${esc(copyText('landingNote','A QUIET PLACE FOR THE STORIES THAT STAY WITH YOU'))}</div></section>`;
}
function posterCard(media, index, library = false) {
  const existing = library || store.state.entries.find(e => e.anilistId && e.anilistId === media.anilistId);
  const entryId = library ? media.id : existing?.id;
  return `<article class="poster-card"><div class="poster-art"><a ${entryId ? `href="/entry/${esc(entryId)}"` : `href="#" data-action="preview" data-index="${index}"`} aria-label="View ${esc(media.title)}"><img src="${esc(imageUrl(media.posterUrl))}" alt="${esc(media.title)} poster" loading="lazy" width="230" height="320"></a><span class="rating">${icon('star', 12)} ${media.globalRating == null ? '—' : Number(media.globalRating).toFixed(1)}</span><button class="poster-add ${existing ? 'added' : ''}" data-action="${entryId ? 'open-entry' : 'quick-add'}" ${entryId ? `data-id="${esc(entryId)}"` : `data-index="${index}"`} aria-label="${existing ? 'Open' : 'Add'} ${esc(media.title)}">${icon(existing ? 'check' : 'plus', 18)}</button>${library ? `<span class="poster-status">${esc(statusLabels[media.status])}</span>` : ''}</div><div class="poster-meta"><span>${esc(typeLabels[media.type])} <i>•</i> ${media.totalUnits ?? 'Ongoing'}${media.totalUnits ? media.type === 'ANIME' ? ' episodes' : ' chapters' : ''}</span><h3><a ${entryId ? `href="/entry/${esc(entryId)}"` : `href="#" data-action="preview" data-index="${index}"`}>${esc(media.title)}</a></h3>${library ? progressControls(media) : ''}</div></article>`;
}
function progressControls(entry) {
  return `<div class="progress-controls"><span>${entry.progress}<small> / ${entry.totalUnits ?? '?'}</small></span><div><button data-action="step" data-id="${esc(entry.id)}" data-delta="-1" aria-label="Decrease progress for ${esc(entry.title)}" ${entry.progress === 0 ? 'disabled' : ''}>−</button><button data-action="step" data-id="${esc(entry.id)}" data-delta="1" aria-label="Increase progress for ${esc(entry.title)}" ${entry.totalUnits && entry.progress >= entry.totalUnits ? 'disabled' : ''}>+</button></div></div><div class="progress-track"><span style="width:${entry.totalUnits ? Math.min(100, entry.progress / entry.totalUnits * 100) : 0}%"></span></div>`;
}
function dayTabs() { return `<div class="day-tabs" role="group" aria-label="Day of the week">${days.map((d, i) => `<button data-action="day" data-day="${i}" aria-pressed="${i === activeDay}" class="${i === activeDay ? 'active' : ''}">${d.slice(0, 3)}${i === (new Date().getDay() + 6) % 7 ? '<i></i>' : ''}</button>`).join('')}</div>`; }
function scheduleList() {
  const live = airingRows.filter(row => (new Date(row.airingAt * 1000).getDay() + 6) % 7 === activeDay);
  if (live.length) return live.slice(0, 6).map(row => `<article class="airing-item"><img src="${esc(imageUrl(row.media?.posterUrl))}" alt="${esc(row.media?.title || 'Anime')} poster" loading="lazy"><div><h3>${esc(row.media?.title || 'Upcoming episode')}</h3><span>Episode ${row.episode} · ${new Date(row.airingAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div><time>${new Date(row.airingAt * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time></article>`).join('');
  return `<div class="schedule-empty">${icon('moon', 28)}<p>${airingError ? 'The schedule needs another try.' : airingLoaded ? 'A little breathing room.' : 'Finding this week’s episodes…'}</p><span>${airingError ? esc(airingError) : airingLoaded ? `No episodes listed for ${days[activeDay].toLowerCase()}.` : 'Live times will appear when AniList responds.'}</span><button class="text-link" data-action="refresh-airing">${airingError || !airingLoaded ? 'Try again' : 'Refresh schedule'} ${icon('arrow',14)}</button></div>`;
}
async function loadUpcomingEpisodes() { airingError = ''; const list = document.querySelector('#schedule-list'); if (list) list.innerHTML = scheduleList(); try { const data = await store.api('airing'); airingRows = Array.isArray(data) ? data : []; airingLoaded = true; airingError = ''; } catch (error) { airingLoaded = true; airingRows = []; airingError = error.message; } const target = document.querySelector('#schedule-list'); if (target) target.innerHTML = scheduleList(); }
function trivia() {
  const fact = store.state.trivia[factIndex % store.state.trivia.length];
  return fact ? `<div class="trivia-icon">${icon('sparkle', 27)}</div><div><span class="eyebrow">A LITTLE SOMETHING EXTRA · ${esc(fact.tag)}</span><p>${esc(fact.fact)}</p></div><button class="icon-button" data-action="next-fact" aria-label="Next trivia fact">${icon('arrow')}</button>` : `<p>New trivia is on the way.</p>`;
}
function communitySections() {
  const comments = homeCommunity.comments || [];
  const rankings = homeCommunity.rankings || [];
  const localMode = store.mode === 'local';
  const title = localMode ? 'Your highest-rated stories.' : 'The stories your circle loves.';
  return `<section class="home-social section" aria-label="Cosmos community"><div class="community-column"><div class="section-heading"><div><span class="eyebrow">${esc(copyText('homeCommunityEyebrow','LITTLE NOTES FROM THE CIRCLE'))}</span><h2>${esc(copyText('homeCommunityTitle','The community board.'))}</h2></div><a href="/discover" class="text-link">Find a story ${icon('arrow',15)}</a></div><div class="community-feed">${comments.length ? comments.map(comment => `<article class="community-card"><div class="community-person">${comment.user?.avatarUrl ? `<img src="${esc(imageUrl(comment.user.avatarUrl))}" alt="">` : `<span class="community-avatar">${icon('user',17)}</span>`}<div><strong>${esc(comment.user?.username || 'A friend')}</strong><time>${new Date(comment.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div></div><p>${esc(comment.body)}</p><div class="community-anime"><img src="${esc(imageUrl(comment.posterUrl))}" alt="" loading="lazy"><div><span>ON THEIR MIND</span><strong>${esc(comment.title)}</strong>${comment.personalScore == null ? '' : `<small>★ ${Number(comment.personalScore).toFixed(1)} / 10</small>`}</div></div></article>`).join('') : empty('A space for the good bits', localMode ? 'Leave a note on one of your anime entries and it will show up here.' : 'No one has left a note yet. Start the conversation on an anime page.', '<a class="button secondary" href="/discover">Explore anime</a>')}</div></div><aside class="circle-ranking"><div class="section-heading"><div><span class="eyebrow">${esc(copyText('homeRankingEyebrow',localMode ? 'YOUR LIBRARY' : 'FRIEND SCORES'))}</span><h2>${esc(copyText('homeRankingTitle',title))}</h2></div></div>${rankings.length ? `<ol class="ranking-list">${rankings.slice(0,6).map((item,index) => `<li><span class="ranking-number">${String(index+1).padStart(2,'0')}</span><img src="${esc(imageUrl(item.posterUrl))}" alt="" loading="lazy"><div class="ranking-copy"><strong>${esc(item.title)}</strong><span>${Number(item.ratingCount||1)} ${Number(item.ratingCount||1)===1?'rating':'ratings'}${item.episodes ? ` · ${item.episodes} eps` : ''}</span></div><span class="ranking-score">★ ${Number(item.score).toFixed(1)}</span></li>`).join('')}</ol>` : empty('No ratings to rank yet', localMode ? 'Rate a few stories to start your personal chart.' : 'The chart will grow as friends rate anime.')}</aside></section>`;
}
async function loadCommunity(version) {
  const target = document.querySelector('#home-community');
  if (!target) return;
  try {
    if (store.mode === 'connected') homeCommunity = await store.api('community');
    else {
      const comments = (store.state.comments || []).slice().reverse().flatMap(comment => {
        const entry = store.state.entries.find(item => item.id === comment.entry);
        return entry ? [{ ...comment, user: store.state.user, title: entry.title, posterUrl: entry.posterUrl, personalScore: entry.personalScore }] : [];
      });
      const rankings = store.state.entries.filter(entry => entry.personalScore != null).slice().sort((a,b) => b.personalScore-a.personalScore).map(entry => ({ title: entry.title, posterUrl: entry.posterUrl, score: entry.personalScore, ratingCount: 1, episodes: entry.totalUnits }));
      homeCommunity = { comments, rankings };
    }
    if (version === navVersion && target.isConnected) target.innerHTML = communitySections();
  } catch {
    if (version === navVersion && target.isConnected) target.innerHTML = communitySections();
  }
}
function home() {
  const hasVideo = store.state.theme.heroVideoUrl && /^https:\/\//i.test(store.state.theme.heroVideoUrl);
  const continuing = store.state.entries.filter(e => e.status === 'IN_PROGRESS').slice(0, 3);
  const articles = store.mode === 'local' ? store.state.news : store.state.news;
  return `<div class="container"><section class="hero">${hasVideo ? `<video class="hero-video" data-background-video src="${esc(store.state.theme.heroVideoUrl)}" autoplay loop playsinline aria-hidden="true"></video><div class="video-controls"><button class="video-audio" data-action="video-audio" data-video-audio aria-pressed="false" aria-label="Mute background video">${icon('volume', 16)}<span>Sound on</span></button><button class="video-pause" data-action="video" aria-label="Pause background video">Pause background</button></div>` : ''}<div class="hero-content"><span class="hero-label"><i></i> ${esc(copyText('homeEyebrow','YOUR ANIME, ALL IN ONE PLACE'))}</span><h1>${esc(copyText('homeTitleFirst','Find your next'))}<br><em>${esc(copyText('homeTitleSecond','favorite story.'))}</em></h1><p>${esc(copyText('homeDescription','Keep track of the worlds you love.\nMake room for the ones you haven’t met yet.\nShare a little of it with your friends.')).replaceAll('\n','<br>')}</p><div class="hero-actions"><a class="button primary" href="/discover">Explore anime ${icon('arrow', 18)}</a><a class="text-link" href="/rating-hub">My library ${icon('chevron', 16)}</a></div><div class="hero-foot"><span class="tiny-orbit">✳</span><span>ANIME <b>/</b> MANGA <b>/</b> MANHWA</span></div></div><div class="hero-caption"><span>YOUR STORIES, AT YOUR PACE</span><span>01 — ∞</span></div></section>
  <div class="welcome-strip"><div>${icon('sparkle', 20)}<p>${esc(copyText('homeWelcomeTitle','Your universe, your pace.'))}<span> ${esc(copyText('homeWelcomeBody','Track a little. Discover a lot.'))}</span></p></div><a href="/profile">${store.mode === 'local' ? 'Your personal space' : esc(store.state.user.username)} ${icon('arrow', 16)}</a></div><div id="home-community">${communitySections()}</div>
  ${continuing.length ? `<section class="section"><div class="section-heading"><div><span class="eyebrow">${esc(copyText('homeContinueEyebrow','PICK UP WHERE YOU LEFT OFF'))}</span><h2>${esc(copyText('homeContinueTitle','One more episode?'))}</h2></div><a href="/rating-hub" class="text-link">Your library ${icon('arrow', 16)}</a></div><div class="continue-grid">${continuing.map(e => `<article class="continue-card"><a href="/entry/${esc(e.id)}"><img src="${esc(imageUrl(e.posterUrl))}" alt=""></a><div><a href="/entry/${esc(e.id)}"><h3>${esc(e.title)}</h3></a>${progressControls(e)}</div></article>`).join('')}</div></section>` : ''}
  <section class="section"><div class="section-heading"><div><span class="eyebrow">${esc(copyText('homeCuratedEyebrow','CURATED FOR YOUR CURIOSITY'))}</span><h2>${esc(copyText('homeCuratedTitle','A world worth getting lost in.'))}</h2></div><a href="/discover" class="text-link">Explore all ${icon('arrow', 16)}</a></div><div class="poster-grid home-posters">${picks.map((m, i) => posterCard(m, i)).join('')}</div></section>
   <section class="home-bottom section"><div class="journal"><div class="section-heading"><div><span class="eyebrow">${esc(copyText('homeJournalEyebrow','FROM THE COSMOS JOURNAL'))}</span><h2>${esc(copyText('homeJournalTitle','Beyond the screen.'))}</h2></div><span class="mini-label">${store.mode === 'local' ? 'EDITORIAL' : 'NEWS'}</span></div><div class="news-grid">${articles.slice(0, 3).map((n, i) => `<button class="news-card" data-action="article" data-index="${i}"><div class="news-image"><img src="${esc(imageUrl(n.imageUrl))}" alt="" loading="lazy"><span>${esc(n.tag)}</span></div><h3>${esc(n.headline)}</h3><span class="text-link">Read story ${icon('arrow', 14)}</span></button>`).join('') || empty('Space for new stories', 'The next update will appear here.')}</div></div><aside class="schedule-panel"><div class="section-heading"><div><span class="eyebrow">${esc(copyText('homeScheduleEyebrow','LIVE FROM ANILIST'))}</span><h2>${esc(copyText('homeScheduleTitle','On the horizon.'))}</h2></div><button class="icon-button" data-action="refresh-airing" aria-label="Refresh upcoming episodes">${icon('refresh',18)}</button></div><p class="small muted">${esc(copyText('homeScheduleSubtitle','Upcoming episodes, grouped by day in your local time'))}</p>${dayTabs()}<div id="schedule-list">${scheduleList()}</div><a class="schedule-link" href="/schedule">Explore seasonal calendar ${icon('arrow', 16)}</a></aside></section>
  <section class="trivia-bar" id="trivia">${trivia()}</section><section class="closing-banner"><div><span class="eyebrow">${esc(copyText('homeClosingEyebrow','KEEP THE GOOD STORIES CLOSE'))}</span><h2>${esc(copyText('homeClosingTitle','Your next chapter starts here.'))}</h2><p>${esc(copyText('homeClosingSubtitle','A home for every episode, chapter, and impossible-to-forget ending.'))}</p></div>${addButton}</section></div>`;
}
function filteredEntries() {
  const entries = store.state.entries.filter(e => (filters.type === 'ALL' || e.type === filters.type) && (filters.status === 'ALL' || e.status === filters.status) && e.title.toLowerCase().includes(filters.query.toLowerCase()));
  if (filters.sort === 'title') entries.sort((a, b) => a.title.localeCompare(b.title));
  if (filters.sort === 'score') entries.sort((a, b) => (b.personalScore ?? -1) - (a.personalScore ?? -1));
  return entries;
}
function libraryResults() {
  const entries = filteredEntries();
  const count = document.querySelector('#result-count'); if (count) count.textContent = `${entries.length} titles`;
  return entries.length ? `<div class="${filters.view === 'grid' ? 'poster-grid library-grid' : 'library-list'}">${entries.map((e, i) => filters.view === 'grid' ? posterCard(e, i, true) : `<article class="library-row"><a href="/entry/${esc(e.id)}"><img src="${esc(imageUrl(e.posterUrl))}" alt=""></a><div><span class="eyebrow">${esc(e.type)}</span><a href="/entry/${esc(e.id)}"><h3>${esc(e.title)}</h3></a><span class="small muted">${esc(statusLabels[e.status])} · ${e.personalScore == null ? 'Not rated' : `★ ${e.personalScore.toFixed(1)}`}</span></div><div class="row-progress">${progressControls(e)}</div><a class="icon-button" href="/entry/${esc(e.id)}" aria-label="Edit ${esc(e.title)}">${icon('chevron')}</a></article>`).join('')}</div>` : empty(store.state.entries.length ? copyText('libraryFilteredEmptyTitle','No matching stories') : copyText('libraryEmptyTitle','A universe waiting to be filled'), store.state.entries.length ? copyText('libraryFilteredEmptyBody','Try another search or filter.') : copyText('libraryEmptyBody','Add your first anime, manga, or manhwa and make this space yours.'), addButton);
}
function library() {
  return `<div class="container">${pageHead('YOUR PERSONAL COLLECTION', 'Every story, in one place.', 'A little progress today. A whole universe over time.', addButton)}<div class="stat-grid"><div><span>${esc(copyText('libraryCountLabel','In your collection'))}</span><strong>${store.state.entries.length}<small>titles</small></strong></div><div><span>${esc(copyText('libraryWatchingLabel','Currently exploring'))}</span><strong>${store.state.entries.filter(e => e.status === 'IN_PROGRESS').length}<small>in progress</small></strong></div><div><span>${esc(copyText('libraryCompletedLabel','Stories completed'))}</span><strong>${store.state.entries.filter(e => e.status === 'COMPLETED').length}<small>finished</small></strong></div><div><span>${esc(copyText('libraryProgressLabel','Every little step'))}</span><strong>${totalProgress()}<small>episodes / chapters</small></strong></div></div><div class="library-tools"><div class="segmented" aria-label="Media format">${['ALL', 'ANIME', 'MANGA', 'MANHWA'].map(t => `<button data-action="filter-type" data-type="${t}" aria-pressed="${filters.type === t}" class="${filters.type === t ? 'active' : ''}">${typeLabels[t] || 'All formats'}</button>`).join('')}</div><label class="search-box">${icon('search', 18)}<input id="library-search" type="search" placeholder="Search your collection…" aria-label="Search your collection" value="${esc(filters.query)}"></label><select id="library-sort" aria-label="Sort collection"><option value="recent" ${filters.sort === 'recent' ? 'selected' : ''}>Recently added</option><option value="title" ${filters.sort === 'title' ? 'selected' : ''}>Title A–Z</option><option value="score" ${filters.sort === 'score' ? 'selected' : ''}>Personal score</option></select><div class="view-switch">${['grid', 'list'].map(v => `<button class="icon-button ${filters.view === v ? 'active' : ''}" data-action="view" data-view="${v}" aria-label="${v} view" aria-pressed="${filters.view === v}">${icon(v, 18)}</button>`).join('')}</div></div><div class="status-tabs" role="group" aria-label="Collection status">${Object.entries({ ALL: 'All stories', ...statusLabels }).map(([key, label]) => `<button class="${filters.status === key ? 'active' : ''}" data-action="filter-status" data-status="${key}" aria-pressed="${filters.status === key}">${label}</button>`).join('')}<span id="result-count">${filteredEntries().length} titles</span></div><div id="library-results">${libraryResults()}</div></div>`;
}
function discover() {
  const genres = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'];
  const formats = ['TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MANGA','NOVEL'];
  return `<div class="container">${pageHead(copyText('discoverEyebrow','FOLLOW YOUR CURIOSITY'),copyText('discoverTitle','There’s a story for that.'),copyText('discoverSubtitle','Find your next favorite across anime, manga, and manhwa.'))}<form id="discover-search" class="discover-search discovery-filters"><label class="search-box">${icon('search')}<input name="q" type="search" placeholder="${esc(copyText('discoverSearchHint','A title, a new world, a familiar favorite…'))}" aria-label="Search AniList" maxlength="100" value="${esc(discoverQuery)}"></label><select name="type" aria-label="Media type">${Object.entries(typeLabels).map(([k, v]) => `<option value="${k}" ${discoverType===k?'selected':''}>${v}</option>`).join('')}</select><select name="sort" aria-label="Rank results"><option value="TRENDING_DESC" ${discoverFilters.sort==='TRENDING_DESC'?'selected':''}>Trending</option><option value="POPULARITY_DESC" ${discoverFilters.sort==='POPULARITY_DESC'?'selected':''}>Most popular</option><option value="SCORE_DESC" ${discoverFilters.sort==='SCORE_DESC'?'selected':''}>Highest rated</option><option value="START_DATE_DESC" ${discoverFilters.sort==='START_DATE_DESC'?'selected':''}>Recently released</option><option value="FAVOURITES_DESC" ${discoverFilters.sort==='FAVOURITES_DESC'?'selected':''}>Most favorited · AniList</option></select><select name="genre" aria-label="Genre"><option value="">Any genre</option>${genres.map(g=>`<option ${discoverFilters.genre===g?'selected':''}>${g}</option>`).join('')}</select><select name="format" aria-label="Format"><option value="">Any format</option>${formats.map(f=>`<option value="${f}" ${discoverFilters.format===f?'selected':''}>${f.replace('_',' ')}</option>`).join('')}</select><select name="season" aria-label="Season"><option value="">Any season</option>${['WINTER','SPRING','SUMMER','FALL'].map(s=>`<option ${discoverFilters.season===s?'selected':''}>${s}</option>`).join('')}</select><select name="year" aria-label="Release year"><option value="">Any year</option>${Array.from({length:new Date().getFullYear()-1949},(_,i)=>new Date().getFullYear()-i).map(y=>`<option ${Number(discoverFilters.year)===y?'selected':''}>${y}</option>`).join('')}</select><select name="status" aria-label="Release status"><option value="">Any release status</option><option value="RELEASING">Airing / releasing</option><option value="FINISHED">Finished</option><option value="NOT_YET_RELEASED">Upcoming</option></select><button class="button primary" type="submit">Refresh stories ${icon('arrow',16)}</button></form><div id="discover-results" aria-live="polite"><div class="loading small">Loading what’s trending…</div></div><p class="discovery-credit">Catalog and ratings powered by <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">AniList ↗</a>. Friend scores are separate from AniList ratings.</p></div>`;
}
function schedulePage() {
  const seasons = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  return `<div class="container">${pageHead(copyText('calendarEyebrow','ANILIST SEASONAL GUIDE'),copyText('calendarTitle','The seasonal calendar.'),copyText('calendarSubtitle','Browse anime by premiere season, with poster art, start dates, scores, and format.'))}<div class="calendar-filters panel"><label class="field">Season<select id="calendar-season" aria-label="Anime season">${Object.entries(seasons).map(([key,label])=>`<option value="${key}" ${season===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field">Year<select id="calendar-year" aria-label="Anime season year">${Array.from({length:new Date().getFullYear()+3-2000},(_,i)=>new Date().getFullYear()+2-i).map(y=>`<option value="${y}" ${seasonYear===y?'selected':''}>${y}</option>`).join('')}</select></label><span class="small muted">Season data by AniList · 2000–${new Date().getFullYear()+2}</span></div><div id="calendar-results" aria-live="polite"><div class="loading small">Finding this season…</div></div><div class="trivia-bar" id="trivia">${trivia()}</div></div>`;
}
function searchResultCards() {
  return searchResults.map((m, i) => `<article class="discovery-card"><button class="discovery-poster" data-action="discovery-preview" data-index="${i}" aria-label="Details for ${esc(m.title)}"><img src="${esc(imageUrl(m.posterUrl))}" alt="${esc(m.title)} poster" loading="lazy"><span class="poster-score">${m.globalRating == null ? '—' : `★ ${m.globalRating.toFixed(1)}`}</span></button><div class="discovery-copy"><div class="eyebrow">${esc(m.type)} · ${esc(m.format || 'FORMAT TBA')} · ${esc(m.season ? `${m.season} ${m.seasonYear || ''}` : m.seasonYear || 'Season TBA')}</div><h2>${esc(m.title)}</h2><p>${esc((m.synopsis || 'A new story for your collection.').slice(0, 320))}</p><div class="genre-chips">${(m.genres || []).slice(0,4).map(g=>`<span>${esc(g)}</span>`).join('')}</div><div class="discovery-stats"><span>AniList ${m.globalRating == null ? 'score pending' : m.globalRating.toFixed(1)}</span><span>${Number(m.popularity || 0).toLocaleString()} following</span><span>${m.totalUnits ? `${m.totalUnits} eps/chapters` : esc(m.status || 'Ongoing')}</span></div><div class="row-actions"><button class="button secondary small-button" data-action="discovery-preview" data-index="${i}">Details</button><button class="button primary small-button" data-action="search-add" data-index="${i}">${icon('plus',15)} Add to library</button></div></div></article>`).join('');
}
let discoveryObserver, calendarObserver;
function watchForMore(element, callback) {
  if (!element || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) callback(); }, { rootMargin: '700px 0px' });
  observer.observe(element);
  return observer;
}
async function loadMoreDiscover() {
  if (discoverLoading || !discoverHasNext) return;
  discoverLoading = true;
  const target = document.querySelector('#discover-results'); if (!target) { discoverLoading = false; return; }
  const nextPage = discoverPage + 1;
  try {
    const data = await store.api(discoverUrl(nextPage));
    if (!target.isConnected) return;
    searchResults.push(...data.results); discoverPage = data.page; discoverHasNext = data.hasNextPage;
    renderDiscoverResults();
    discoveryObserver?.disconnect(); discoveryObserver = watchForMore(document.querySelector('#discover-more'), loadMoreDiscover);
  } catch (error) { const more = document.querySelector('#discover-more'); if (more) more.textContent = `${error.message} Scroll to retry.`; }
  finally { discoverLoading = false; }
}
function discoverUrl(page = 1) {
  const params = new URLSearchParams({ type: discoverType, page: String(page), sort: discoverFilters.sort });
  if (discoverQuery) params.set('q', discoverQuery);
  for (const [key, value] of Object.entries(discoverFilters)) if (key !== 'sort' && value) params.set(key, value);
  return `search?${params}`;
}
function renderDiscoverResults() {
  const target = document.querySelector('#discover-results'); if (!target) return;
  const label = discoverQuery ? `Matches for “${esc(discoverQuery)}”` : ({ TRENDING_DESC: 'Trending this week', POPULARITY_DESC: 'Most loved by anime fans', SCORE_DESC: 'Highest rated stories', START_DATE_DESC: 'Recently released', FAVOURITES_DESC: 'Most favorited' }[discoverFilters.sort] || 'Explore the catalog');
  target.innerHTML = `<div class="section-heading"><div><span class="eyebrow">${esc(copyText('discoverResultsEyebrow','THE DISCOVERY FEED'))}</span><h2>${discoverQuery ? label : esc(copyText('discoverResultsTitle',label))}</h2></div><span class="mini-label">${searchResults.length.toLocaleString()} TITLES${discoverHasNext ? ' +' : ''}</span></div>${searchResults.length ? `<div class="discovery-feed">${searchResultCards()}</div>` : empty(copyText('discoverEmptyTitle','No stories found'), copyText('discoverEmptyBody','Try a different title or loosen a couple of filters.'))}${discoverHasNext ? `<div id="discover-more" class="scroll-more" aria-live="polite"><button class="button secondary small-button" data-action="load-more-discover">Keep exploring ${icon('arrow',14)}</button></div>` : searchResults.length ? '<p class="scroll-more">You’re all caught up for now.</p>' : ''}`;
}
async function loadDiscovery(reset = true) {
  if (discoverLoading) return;
  discoverLoading = true;
  const target = document.querySelector('#discover-results'); if (!target) { discoverLoading = false; return; }
  if (reset) { discoveryObserver?.disconnect(); searchResults = []; discoverPage = 1; discoverHasNext = false; target.innerHTML = '<div class="loading small">Finding a story…</div>'; }
  try {
    const page = reset ? 1 : discoverPage + 1;
    const data = await store.api(discoverUrl(page));
    if (!target.isConnected) return;
    searchResults = reset ? data.results : [...searchResults, ...data.results]; discoverPage = data.page; discoverHasNext = data.hasNextPage; renderDiscoverResults();
    discoveryObserver?.disconnect(); if (discoverHasNext) discoveryObserver = watchForMore(document.querySelector('#discover-more'), loadMoreDiscover);
  } catch (error) { if (target.isConnected) target.innerHTML = `<div class="notice"><p>${esc(error.message)}</p><button class="button secondary" data-action="retry-discover">Retry</button></div>`; }
  finally { discoverLoading = false; }
}
function renderCalendar() {
  const target = document.querySelector('#calendar-results'); if (!target) return;
  const cards = seasonRows.map((m,i) => {
    const d=m.startDate, date=d?.year&&d?.month&&d?.day ? new Date(Date.UTC(d.year,d.month-1,d.day)).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}) : 'Date TBA';
    return `<article class="poster-card season-card"><a class="season-poster" href="https://anilist.co/anime/${m.anilistId}" target="_blank" rel="noopener noreferrer"><img src="${esc(imageUrl(m.posterUrl))}" alt="${esc(m.title)} poster" loading="lazy"><span>${date}</span></a><div class="poster-meta"><span>${esc(m.format || 'TV')} · ${esc(m.status || 'TBA')}</span><h3>${esc(m.title)}</h3><p>${m.totalUnits ? `${m.totalUnits} episodes` : 'Episode count TBA'} · ${m.globalRating == null ? 'AniList score pending' : `AniList ${m.globalRating.toFixed(1)}`} · ${esc((m.genres || []).slice(0,2).join(' / '))}</p><button class="button secondary small-button" data-action="calendar-add" data-index="${i}">${icon('plus',14)} Add to my library</button></div></article>`;
  }).join('');
    target.innerHTML = `${seasonRows.length ? `<div class="section-heading"><div><span class="eyebrow">${season} ${seasonYear}</span><h2>${esc(copyText('calendarResultsTitle','Premieres & returning worlds.'))}</h2></div><span class="mini-label">${seasonRows.length} TITLES</span></div><div class="poster-grid calendar-grid">${cards}</div>` : empty(copyText('calendarEmptyTitle','A quiet season so far'), copyText('calendarEmptyBody','Try another season or year to see its anime lineup.'))}${seasonHasNext ? `<div id="calendar-more" class="scroll-more" aria-live="polite"><button class="button secondary small-button" data-action="load-more-calendar">${esc(copyText('calendarMoreLabel','Load more from this season'))}</button></div>` : `<p class="scroll-more">${esc(copyText('calendarEndLine','End of this season’s list.'))}</p>`}`;
  calendarObserver?.disconnect(); if (seasonHasNext) calendarObserver = watchForMore(document.querySelector('#calendar-more'), () => loadCalendar(false));
}
async function loadCalendar(reset = true) {
  const target = document.querySelector('#calendar-results'); if (!target) return;
  if (reset) { seasonRows = []; seasonPage = 1; target.innerHTML = '<div class="loading small">Finding this season…</div>'; }
  const requestedPage = reset ? 1 : seasonPage + 1;
  try {
    const data = await store.api(`calendar?season=${season}&year=${seasonYear}&page=${requestedPage}`);
    if (!target.isConnected) return;
    seasonRows = reset ? data.results : [...seasonRows, ...data.results]; seasonPage = data.page; seasonHasNext = data.hasNextPage; renderCalendar();
  } catch (error) { target.innerHTML = `<div class="notice"><p>${esc(error.message)}</p><button class="button secondary" data-action="refresh-calendar">Try again</button></div>`; }
}
function themeForm(local = false) {
  const theme = store.state.theme;
  const copyLabels = Object.fromEntries(Object.keys(defaultTheme.copy).map(key => {
    const words = key.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) || [key];
    const label = words.slice(1).join(' ').replace(/Eyebrow/gi, 'small heading').replace(/Subtitle/gi, 'subheading').replace(/Description/gi, 'supporting line');
    return [key, words[0][0].toUpperCase() + words[0].slice(1) + (label ? ' · ' + label : '')];
  }));
  const copySections = ['landing','home','discover','calendar','library','profile','entry','admin'];
  const groupedCopy = copySections.map(section => {
    const items = Object.entries(copyLabels).filter(([key]) => key.startsWith(section));
    if (!items.length) return '';
    let fields = '';
    for (const [key,label] of items) fields += '<label class="field">' + esc(label) + '<textarea name="copy_' + key + '" maxlength="300" rows="' + (/Description|Subtitle|Line|Body/i.test(key) ? 3 : 2) + '">' + esc(theme.copy?.[key] || defaultTheme.copy[key]) + '</textarea></label>';
    const title = section[0].toUpperCase() + section.slice(1);
    return '<details class="copy-group"><summary>' + title + ' · ' + items.length + ' editable lines</summary><div class="copy-fields">' + fields + '</div></details>';
  }).join('');
  return `<form id="theme-form" class="stack"><div class="color-fields">${Object.entries({ colorAccentPrimary: 'Primary accent', colorAccentSecondary: 'Secondary accent', colorAccentTertiary: 'Third accent', colorBase: 'Background', colorSurface: 'Surface' }).map(([key, label]) => field(label, key, theme[key], { type: 'color' })).join('')}</div>${field('Landing video URL (optional)', 'heroVideoUrl', theme.heroVideoUrl || '', { type: 'url', placeholder: 'https://…/your-video.mp4', maxlength: 2048 })}<label class="button secondary upload-label">${icon('plus',16)} Upload landing video<input id="hero-video-file" type="file" accept="video/mp4,video/webm,video/quicktime" class="visually-hidden"></label><p id="hero-upload-status" class="small muted" aria-live="polite">${local ? 'Personal appearance changes stay on this browser.' : 'MP4, WebM, or QuickTime · up to 5 GB · uploads directly to persistent Cosmos storage.'}</p><details class="copy-editor"><summary>${esc(copyText('adminCopyEditorTitle','Edit headings and supporting lines'))}</summary><p class="small muted">${esc(copyText('adminCopyEditorDescription','Change the headings, subtitles, section labels, and short lines shown throughout Cosmos.'))}</p><div class="copy-groups">${groupedCopy}</div></details><div class="form-actions"><button class="button primary">Save appearance</button><button class="button secondary" type="button" data-action="reset-theme">Reset colors</button></div></form>`;
}
function profilePage() {
  const user = store.state.user;
  return `<div class="container narrow">${pageHead('YOUR LITTLE CORNER', 'Make yourself at home.', store.mode === 'local' ? 'Your collection stays in this browser. Export a backup to keep it safe or take it with you.' : 'Your anonymous account is linked to this browser’s private cookie. Export your collection before clearing browser data.')}<div class="profile-layout"><section class="panel profile-card"><div class="avatar large">${avatar()}</div><span class="level-tag">${esc(copyText('profileCardEyebrow','YOUR PROFILE'))}</span><h2>${esc(user.username)}</h2><p class="profile-id">PROFILE ID · <code>${esc(user.id)}</code></p><p>${store.state.entries.length} ${esc(copyText('profileSummaryLine','stories collected'))}<br>${totalProgress()} ${esc(copyText('profileProgressLine','moments explored'))}</p><label class="button secondary upload-label">${icon('plus',16)} ${esc(copyText('profileAvatarButton','Upload avatar'))}<input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="visually-hidden"></label><span class="small muted">${esc(copyText('profileAvatarHint','PNG, JPG, WebP, GIF · up to 10 MB'))}</span></section><section class="panel"><h2>${esc(copyText('profileDetailsHeading','Profile details'))}</h2><form id="profile-form" class="stack">${field('Display name', 'username', user.username, { required: true, maxlength: 24 })}${field('Avatar image URL (optional)', 'avatarUrl', user.avatarUrl?.startsWith('https://') ? user.avatarUrl : '', { type: 'url', maxlength: 2048, placeholder: 'https://…/your-avatar.jpg' })}<button class="button primary">Save profile ${icon('check',16)}</button></form></section></div><section class="panel backup-panel"><div><span class="eyebrow">${esc(copyText('profileBackupEyebrow','TAKE YOUR STORIES WITH YOU'))}</span><h2>${esc(copyText('profileBackupTitle','Your collection, kept safe.'))}</h2><p>${esc(copyText('profileBackupDescription','Export a JSON backup or import a Cosmos collection. Import keeps your existing entries.'))}</p></div><div class="stack"><button class="button secondary" data-action="export">${icon('download',17)} Export collection</button><label class="button secondary upload-label">Import collection<input id="import-file" type="file" accept=".json,application/json" class="visually-hidden"></label></div></section>${store.mode === 'local' ? `<section class="panel"><h2>${esc(copyText('profileCustomizeHeading','A little more you.'))}</h2>${themeForm(true)}</section>` : ''}</div>`;
}
function entryPage(entry) {
  if (!entry) return `<div class="container">${empty('This story isn’t in your library', 'It may have been removed. Find something new to add.', '<a class="button primary" href="/discover">Explore titles</a>')}</div>`;
  return `<div class="container narrow"><a class="back-link" href="/rating-hub">← Back to your library</a><section class="entry-hero"><img class="entry-poster" src="${esc(imageUrl(entry.posterUrl))}" alt="${esc(entry.title)} poster"><div><span class="eyebrow">${esc(entry.type)} · ${entry.totalUnits ?? 'ONGOING'} ${entry.totalUnits ? entry.type === 'ANIME' ? 'EPISODES' : 'CHAPTERS' : ''}</span><h1>${esc(entry.title)}</h1><span class="score-pill">${icon('star',15)} ${entry.globalRating == null ? 'Unrated' : `${entry.globalRating.toFixed(1)} community score`}</span><p>${esc(entry.synopsis || 'Every story starts somewhere. Add this one to your journey.')}</p>${entry.anilistId ? `<a class="text-link" href="https://anilist.co/${entry.type === 'ANIME' ? 'anime' : 'manga'}/${entry.anilistId}" target="_blank" rel="noopener noreferrer">Explore on AniList ↗</a>` : ''}</div></section><section class="panel"><div class="section-heading"><h2>${esc(copyText('entryJourneyHeading','Your journey so far.'))}</h2><span class="mini-label">${esc(statusLabels[entry.status])}</span></div><form id="entry-form" data-id="${esc(entry.id)}" class="stack"><div class="form-grid">${field(entry.type === 'ANIME' ? 'Episodes watched' : 'Chapters read', 'progress', entry.progress, { type: 'number', min: 0, max: entry.totalUnits ?? 100000, required: true })}${select('Status', 'status', statusLabels, entry.status)}${field('Your score (0–10, optional)', 'personalScore', entry.personalScore ?? '', { type: 'number', min: 0, max: 10, step: '0.1' })}</div><div class="form-actions"><button class="button primary">Save progress ${icon('check',16)}</button><button type="button" class="button danger" data-action="delete-entry" data-id="${esc(entry.id)}">${icon('trash',16)} Remove title</button></div></form></section><section class="panel"><div class="section-heading"><div><span class="eyebrow">${esc(copyText(store.mode === 'local' ? 'entryNotesLocalEyebrow' : 'entryNotesSharedEyebrow', store.mode === 'local' ? 'A SPACE TO REMEMBER' : 'STORIES BRING US TOGETHER'))}</span><h2>${esc(copyText(store.mode === 'local' ? 'entryNotesLocalHeading' : 'entryNotesSharedHeading', store.mode === 'local' ? 'Personal notes.' : 'The conversation.'))}</h2></div></div><p class="small muted">${esc(copyText(store.mode === 'local' ? 'entryNotesLocalDescription' : 'entryNotesSharedDescription', store.mode === 'local' ? 'Notes are private to this browser. Connect a database to enable community comments.' : 'Comments are shared with other readers watching the same catalog title.'))}</p><div id="comments-list" data-entry="${esc(entry.id)}"><p class="muted">Loading…</p></div><form id="comment-form" data-id="${esc(entry.id)}" class="comment-form"><label class="field">${store.mode === 'local' ? 'Leave a note' : 'Join the conversation'}<textarea name="body" required maxlength="1000" rows="3" placeholder="${esc(copyText('entryCommentPlaceholder','What stayed with you?'))}"></textarea></label><button class="button primary">${store.mode === 'local' ? 'Save note' : 'Post comment'} ${icon('arrow',16)}</button></form></section></div>`;
}
async function loadComments(id, version) {
  try {
    const rows = await store.comments(id);
    if (version !== navVersion) return;
    commentRows = rows;
    document.querySelector('#comments-list').innerHTML = rows.length ? rows.map(c => `<article class="comment"><div class="comment-header"><strong>${esc(c.user.username)}</strong><time>${new Date(c.createdAt).toLocaleDateString()}</time>${c.canDelete ? `<button class="icon-button" data-action="delete-comment" data-id="${esc(c.id)}" aria-label="Delete comment">${icon('trash',15)}</button>` : ''}</div><p>${esc(c.body)}</p></article>`).join('') : '<p class="empty-comments">The first word is yours.</p>';
  } catch (error) { if (version === navVersion) { document.querySelector('#comments-list').innerHTML = '<p class="muted">Could not load comments.</p>'; toast(error.message, true); } }
}
function adminPage() {
  if (store.mode === 'local') return `<div class="container narrow">${pageHead('SITE MANAGEMENT', 'A shared universe needs a home.', 'Personal tracking is ready to use. Shared administration becomes available when a database is connected.')}<section class="panel setup-card">${icon('shield',40)}<h2>Connect your site</h2><p>Set DATABASE_URL, SESSION_SECRET, and ADMIN_PASSWORD in Vercel, then initialize the database using the deployment guide. The admin password stays on the server.</p><p>Connected administrators can manage theme colors, hero videos, users, catalog posters, news, schedules, and trivia.</p><a href="/profile" class="button primary">Customize your personal space ${icon('arrow',16)}</a></section></div>`;
  if (!store.state.admin) return `<div class="container login-container"><section class="panel login-card"><span class="login-icon">${icon('shield',28)}</span><span class="eyebrow">FOR THE KEEPERS OF COSMOS</span><h1>Welcome back.</h1><p>Sign in to manage your shared universe.</p><form id="login-form" class="stack">${field('Admin password', 'password', '', { type: 'password', required: true, maxlength: 200 })}<button class="button primary">Enter admin panel ${icon('arrow',17)}</button></form></section></div>`;
  const tab = location.pathname.split('/')[3] || 'theme';
  const tabs = { theme: 'Appearance', users: 'Users', news: 'News', schedule: 'Schedule', trivia: 'Trivia', media: 'Media catalog' };
  return `<div class="container">${pageHead(copyText('adminEyebrow','BEHIND THE UNIVERSE'), copyText('adminTitle','The control room.'), copyText('adminSubtitle','Publish something good. Keep your community in shape.'), '<button class="button secondary" data-action="logout">Sign out</button>')}<div class="admin-layout"><nav class="admin-nav" aria-label="Admin sections">${Object.entries(tabs).map(([key, label]) => `<a href="/admin/dashboard/${key}" ${key === tab ? 'aria-current="page"' : ''}>${label}${icon('chevron',14)}</a>`).join('')}</nav><section class="panel admin-content"><h2>${esc(tabs[tab] || 'Appearance')}</h2>${tab === 'theme' ? themeForm() : `<div id="admin-content"><p class="muted">Loading…</p></div>`}</section></div></div>`;
}
function contentEditor(kind, item = {}) {
  let fields;
  if (kind === 'news') fields = field('Tag', 'tag', item.tag || 'ANNOUNCEMENT', { required: true, maxlength: 40 }) + field('Headline', 'headline', item.headline || '', { required: true }) + field('Image URL', 'imageUrl', item.imageUrl || '', { type: 'url', maxlength: 2048 });
  if (kind === 'schedule') fields = `<div class="form-grid">${select('Day', 'dayOfWeek', Object.fromEntries(days.map((d, i) => [i, d])), item.dayOfWeek ?? 0)}${field('Episode', 'episode', item.episode || 1, { type: 'number', min: 1, max: 100000, required: true })}</div>${field('Title', 'title', item.title || '', { required: true })}${field('Air time and time zone', 'airTime', item.airTime || '', { required: true, maxlength: 60, placeholder: '21:00 JST' })}`;
  if (kind === 'trivia') fields = `${field('Tag', 'tag', item.tag || '', { required: true, maxlength: 40 })}<label class="field">Fact<textarea name="fact" required maxlength="1000" rows="3">${esc(item.fact || '')}</textarea></label>`;
  return `<form id="content-form" data-kind="${kind}" data-id="${esc(item.id || '')}" class="stack">${fields}<button class="button primary">${item.id ? 'Save changes' : 'Publish'} ${icon('arrow',16)}</button></form>`;
}
async function loadAdmin(tab, version) {
  const supported = ['users', 'news', 'schedule', 'trivia', 'media']; if (!supported.includes(tab)) return;
  const target = document.querySelector('#admin-content');
  try {
    const rows = await store.api(['users', 'media'].includes(tab) ? `admin/${tab}` : `admin/content/${tab}`);
    if (version !== navVersion) return;
    adminRows = rows;
    if (tab === 'users') target.innerHTML = `<p class="small muted">Review account activity and apply reversible blocks or account bans. Account deletion is permanent.</p><div class="admin-rows">${rows.map(u => `<article class="admin-row user-admin-row"><div><h3>${esc(u.username)} ${u.isBanned ? '<span class="badge warning">Banned</span>' : u.isBlocked ? '<span class="badge blocked">Blocked</span>' : '<span class="badge active-badge">Active</span>'}</h3><p class="user-id">ID ${esc(u.id)}</p><p>${u._count.libraryEntries} titles · ${u._count.comments} comments · joined ${new Date(u.createdAt).toLocaleDateString()}</p><p>${u.lastActivity ? `${esc(u.lastActivity.detail)} · ${new Date(u.lastActivity.createdAt).toLocaleDateString()}` : 'No recorded activity yet'}</p></div><div class="row-actions"><button class="button secondary small-button" data-action="view-activity" data-id="${esc(u.id)}">Activity</button><button class="button secondary small-button" data-action="block" data-id="${esc(u.id)}">${u.isBlocked ? 'Unblock' : 'Block'}</button><button class="button secondary small-button" data-action="ban" data-id="${esc(u.id)}">${u.isBanned ? 'Unban' : 'Ban'}</button><button class="button danger small-button" data-action="delete-user" data-id="${esc(u.id)}">Delete account</button></div></article>`).join('') || empty('No profiles yet', 'Profiles will appear here as friends join.')}</div>`;
    else if (tab === 'media') target.innerHTML = `<p class="small muted">Edit shared details, scores, and poster images. Showing up to 500 catalog entries.</p><div class="admin-rows">${rows.map(m => `<article class="admin-row"><img class="mini-poster" src="${esc(imageUrl(m.posterUrl))}" alt=""><div><h3>${esc(m.title)}</h3><p>${esc(m.type)}</p></div><button class="button secondary small-button" data-action="edit-media" data-id="${esc(m.id)}">Edit title</button></article>`).join('') || empty('No catalog entries yet', 'Add a title to a library to begin.')}</div>`;
    else target.innerHTML = `${contentEditor(tab)}<div class="admin-rows">${rows.map(r => `<article class="admin-row"><div><span class="eyebrow">${esc(r.tag || days[r.dayOfWeek])}</span><h3>${esc(r.headline || r.title || r.fact)}</h3>${r.airTime ? `<p>Ep ${r.episode} · ${esc(r.airTime)}</p>` : ''}</div><div class="row-actions"><button class="button secondary small-button" data-action="edit-content" data-kind="${tab}" data-id="${esc(r.id)}">Edit</button><button class="icon-button danger" data-action="delete-content" data-kind="${tab}" data-id="${esc(r.id)}" aria-label="Delete item">${icon('trash',17)}</button></div></article>`).join('')}</div>`;
  } catch (error) { if (version === navVersion) target.innerHTML = `<p role="alert">${esc(error.message)}</p><button class="button secondary" data-action="refresh">Retry</button>`; }
}
function manualForm(media = {}, admin = false) {
  return `<form id="${admin ? 'media-form' : 'manual-form'}" data-id="${esc(media.id || '')}" class="stack">${field('Title', 'title', media.title || '', { required: true, maxlength: 200 })}<div class="form-grid">${select('Format', 'type', typeLabels, media.type || 'ANIME')}${field('Total episodes / chapters', 'totalUnits', media.totalUnits ?? '', { type: 'number', min: 1, max: 100000 })}${field('Community score (optional)', 'globalRating', media.globalRating ?? '', { type: 'number', min: 0, max: 10, step: '0.1' })}</div>${field('Poster URL (optional)', 'posterUrl', media.posterUrl?.startsWith('https://') ? media.posterUrl : '', { type: 'url', maxlength: 2048 })}${admin ? '<label class="button secondary upload-label">Upload poster<input id="poster-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="visually-hidden"></label>' : ''}<label class="field">Synopsis<textarea name="synopsis" maxlength="5000" rows="3">${esc(media.synopsis || '')}</textarea></label><button class="button primary">${admin ? 'Save catalog changes' : 'Add to my library'} ${icon('plus',16)}</button></form>`;
}
function addModal() {
  openDialog('Find your next story.', `<div class="modal-tabs"><span class="active">Search AniList</span></div><form id="modal-search" class="search-form"><div class="search-row"><input name="q" placeholder="Search a title…" aria-label="Search AniList" minlength="2" maxlength="100" required><button class="button primary">Search</button></div>${select('Format', 'type', typeLabels, 'ANIME')}</form><div id="modal-results"><p class="muted">A favorite you know. A world you haven’t met. Start with a title.</p></div>`);
}
function mediaPreview(media) {
  const date = media.startDate?.year ? `${media.startDate.month || ''}/${media.startDate.day || ''}/${media.startDate.year}` : `${media.season || 'Release date'} ${media.seasonYear || 'TBA'}`;
  openDialog(media.title, `${media.bannerImage ? `<img class="preview-banner" src="${esc(imageUrl(media.bannerImage))}" alt="">` : ''}<div class="preview-media"><img src="${esc(imageUrl(media.posterUrl))}" alt="${esc(media.title)} poster"><div><span class="eyebrow">${esc(media.type)} · ${esc(media.format || 'FORMAT TBA')} · ${esc(media.status || 'STATUS TBA')}</span><p>${esc(media.synopsis || 'A new story for your collection.')}</p><div class="genre-chips">${(media.genres || []).map(g=>`<span>${esc(g)}</span>`).join('')}</div><span class="score-pill">AniList ${media.globalRating == null ? 'score pending' : media.globalRating.toFixed(1)} · ${Number(media.popularity || 0).toLocaleString()} following</span><p class="small muted">${esc(date)} · ${media.totalUnits ?? 'Episode count TBA'} ${media.type === 'ANIME' ? 'episodes' : 'chapters'}</p></div></div><button class="button primary full" data-action="preview-add">${icon('plus',16)} Add to my library</button>`);
  modal.previewMedia = media;
}
function confirmDialog(title, message, action, data) {
  const reason = action === 'confirm-moderation' ? '<label class="field moderation-reason">Reason (optional)<textarea id="moderation-reason" maxlength="500" rows="2" placeholder="Add context for the audit history"></textarea></label>' : '';
  openDialog(title, `<p>${esc(message)}</p>${reason}<div class="form-actions"><button class="button secondary" data-action="close-modal">Cancel</button><button class="button danger" data-action="${action}" ${Object.entries(data).map(([key, value]) => `data-${key}="${esc(value)}"`).join(' ')}>Confirm</button></div>`);
}
async function render() {
  if (!store.state) return;
  const version = ++navVersion;
  applyTheme();
  const path = location.pathname.replace(/\/$/, '') || '/';
  const header = document.querySelector('#header'), footer = document.querySelector('#footer'), dock = document.querySelector('#bottom-nav');
  if (path === '/' && sessionStorage.getItem('cosmos.entered') !== '1') {
    document.body.classList.remove('is-interior');
    document.body.classList.add('is-landing');
    header.hidden = true; footer.hidden = true; dock.hidden = true;
    main.innerHTML = landing();
    document.title = 'Cosmos — Your stories, together.';
    startBackgroundVideo();
    return;
  }
  document.body.classList.remove('is-landing');
  document.body.classList.toggle('is-interior', path !== '/' || sessionStorage.getItem('cosmos.entered') === '1');
  header.hidden = false; footer.hidden = false; dock.hidden = false;
  chrome();
  if (path === '/') { main.innerHTML = home(); loadUpcomingEpisodes(); loadCommunity(version); }
  else if (path === '/discover') { main.innerHTML = discover(); loadDiscovery(); }
  else if (path === '/rating-hub') main.innerHTML = library();
  else if (path === '/schedule') { main.innerHTML = schedulePage(); loadCalendar(); }
  else if (path === '/profile') main.innerHTML = profilePage();
  else if (path.startsWith('/entry/')) { const entry = getEntry(path.slice(7)); main.innerHTML = entryPage(entry); if (entry) loadComments(entry.id, version); }
  else if (path.startsWith('/admin')) { main.innerHTML = adminPage(); if (store.mode === 'connected' && store.state.admin) loadAdmin(path.split('/')[3] || 'theme', version); }
  else main.innerHTML = `<div class="container">${empty('That page is waiting to be written', 'This link does not lead to a Cosmos page yet.', '<a class="button primary" href="/">Back home</a>')}</div>`;
  document.title = `${path === '/' ? 'Your stories, together.' : path.startsWith('/entry/') ? getEntry(path.slice(7))?.title || 'Entry' : path.split('/')[1].replace('rating-hub', 'My library')} — Cosmos`;
  startBackgroundVideo();
}
function navigate(path) {
  history.pushState({}, '', path); modal.close(); render(); window.scrollTo({ top: 0 }); main.focus({ preventScroll: true });
  if (new URL(location.href).searchParams.get('add') === '1') addModal();
}
window.addEventListener('popstate', () => { modal.close(); render(); });
document.addEventListener('error', event => { if (event.target instanceof HTMLImageElement && !event.target.src.endsWith('/assets/poster.svg')) event.target.src = '/assets/poster.svg'; }, true);
modal.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close(); } });
async function busy(element, fn) {
  if (element.dataset.busy) return;
  element.dataset.busy = 'true';
  const button = element.matches('form') ? element.querySelector('button[type="submit"], button:not([type])') : element;
  if (button) button.disabled = true;
  try { await fn(); } catch (error) { toast(error.message, true); }
  finally { delete element.dataset.busy; if (button) button.disabled = false; }
}
document.addEventListener('click', async event => {
  const action = event.target.closest('[data-action]');
  if (action) {
    event.preventDefault();
    return busy(action, async () => {
      const { action: name, id, index, kind } = action.dataset;
      if (name === 'enter') { sessionStorage.setItem('cosmos.entered', '1'); await render(); main.focus({ preventScroll: true }); return; }
      if (name === 'welcome') { sessionStorage.removeItem('cosmos.entered'); history.pushState({}, '', '/'); await render(); window.scrollTo(0, 0); return; }
      if (name === 'close-modal') modal.close();
      if (name === 'add') addModal();
      if (name === 'manual') openDialog('A story of your own.', manualForm());
      if (name === 'preview') mediaPreview(picks[Number(index)]);
      if (name === 'discovery-preview') mediaPreview(searchResults[Number(index)]);
      if (name === 'quick-add' || name === 'preview-add' || name === 'search-add' || name === 'modal-add') {
        const media = name === 'quick-add' ? picks[Number(index)] : name === 'preview-add' ? modal.previewMedia : name === 'modal-add' ? modalSearchResults[Number(index)] : searchResults[Number(index)];
        if (!media) return;
        await store.addEntry(media); modal.close(); await render(); toast(`${media.title} added to your library.`);
      }
      if (name === 'calendar-add') { const media = seasonRows[Number(index)]; if (media) { const entry = await store.addEntry(media); navigate(`/entry/${entry.id}`); toast(`${media.title} added to your library.`); } }
      if (name === 'load-more-discover') await loadMoreDiscover();
      if (name === 'load-more-calendar') await loadCalendar(false);
      if (name === 'refresh-calendar') await loadCalendar();
      if (name === 'refresh-airing') await loadUpcomingEpisodes();
      if (name === 'retry-discover') await loadDiscovery();
      if (name === 'open-entry') navigate(`/entry/${id}`);
      if (name === 'step') { const e = getEntry(id); await store.updateEntry(id, { progress: Math.max(0, Math.min(e.totalUnits ?? 100000, e.progress + Number(action.dataset.delta))) }); await render(); }
      if (name === 'filter-type') { filters.type = action.dataset.type; render(); }
      if (name === 'filter-status') { filters.status = action.dataset.status; render(); }
      if (name === 'view') { filters.view = action.dataset.view; render(); }
      if (name === 'day') { activeDay = Number(action.dataset.day); document.querySelector('.day-tabs').outerHTML = dayTabs(); document.querySelector('#schedule-list').innerHTML = scheduleList(); }
      if (name === 'next-fact') { factIndex++; document.querySelector('#trivia').innerHTML = trivia(); }
      if (name === 'article') { const article = store.state.news[Number(index)]; openDialog(article.headline, `<img class="article-image" src="${esc(imageUrl(article.imageUrl))}" alt=""><span class="eyebrow">${esc(article.tag)}</span><p>${esc(article.body || article.headline)}</p>${article.createdAt ? `<p class="muted small">Published ${new Date(article.createdAt).toLocaleDateString()}</p>` : ''}`); }
      if (name === 'delete-entry') confirmDialog('Remove this title?', 'This removes the entry and its associated notes or comments. You can add the title again later.', 'confirm-delete-entry', { id });
      if (name === 'confirm-delete-entry') { await store.removeEntry(id); navigate('/rating-hub'); toast('Title removed.'); }
      if (name === 'delete-comment') confirmDialog('Delete this comment?', 'This comment will be permanently removed.', 'confirm-delete-comment', { id });
      if (name === 'confirm-delete-comment') { await store.deleteComment(id); modal.close(); await loadComments(location.pathname.slice(7), navVersion); toast('Comment deleted.'); }
      if (name === 'export') {
        const url = URL.createObjectURL(new Blob([store.exportLibrary()], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = `cosmos-library-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Collection exported.');
      }
      if (name === 'reset-theme') { await store.saveTheme({ ...defaultTheme, heroVideoUrl: store.state.theme.heroVideoUrl }); await render(); toast('Theme and page copy reset.'); }
      if (name === 'logout') { await store.api('admin/logout', 'POST', {}); store.state.admin = false; navigate('/admin'); }
      if (name === 'ban' || name === 'block') {
        const u = adminRows.find(u => u.id === id);
        const ban = name === 'ban', active = ban ? u.isBanned : u.isBlocked;
        const verb = ban ? (active ? 'unban' : 'ban') : (active ? 'unblock' : 'block');
        confirmDialog(`${verb[0].toUpperCase()}${verb.slice(1)} ${u.username}?`, ban ? 'A ban prevents this profile from accessing Cosmos. You can reverse it later.' : 'A block lets this profile browse but prevents profile, library, and comment changes. You can reverse it later.', 'confirm-moderation', { id, mode: name });
      }
      if (name === 'confirm-moderation') {
        const u = adminRows.find(u => u.id === id);
        const reason = document.querySelector('#moderation-reason')?.value.trim();
        const payload = { ...(mode === 'ban' ? { id, isBanned: !u.isBanned } : { id, isBlocked: !u.isBlocked }), ...(reason ? { reason } : {}) };
        await store.api('admin/users', 'PATCH', payload);
        modal.close(); await render(); toast(mode === 'ban' ? (u.isBanned ? 'Profile unbanned.' : 'Profile banned.') : (u.isBlocked ? 'Profile unblocked.' : 'Profile blocked.'));
      }
      if (name === 'view-activity') {
        const detail = await store.api(`admin/users/${encodeURIComponent(id)}/activity`);
        const timeline = detail.activity.map(item => `<article class="audit-row"><span class="audit-dot"></span><div><strong>${esc(item.detail)}</strong><time>${new Date(item.createdAt).toLocaleString()}</time></div></article>`).join('') || '<p class="muted">No activity recorded yet.</p>';
        const moderation = detail.moderation.map(item => `<article class="audit-row"><span class="audit-dot moderation-dot"></span><div><strong>${esc(item.action)} · ${esc(item.targetUsername)}</strong><time>${new Date(item.createdAt).toLocaleString()}${item.reason ? ` · ${esc(item.reason)}` : ''}</time></div></article>`).join('') || '<p class="muted">No moderation actions.</p>';
        openDialog(`${detail.user.username} · Activity`, `<div class="audit-section"><span class="eyebrow">PROFILE ACTIVITY</span>${timeline}</div><div class="audit-section"><span class="eyebrow">MODERATION HISTORY</span>${moderation}</div>`);
      }
      if (name === 'delete-user') confirmDialog('Permanently delete this account?', 'Their library and comments will also be removed. This cannot be undone.', 'confirm-delete-user', { id });
      if (name === 'confirm-delete-user') { await store.api('admin/users', 'DELETE', { id }); modal.close(); render(); toast('Account deleted.'); }
      if (name === 'edit-content') openDialog(`Edit ${kind}`, contentEditor(kind, adminRows.find(r => r.id === id)));
      if (name === 'delete-content') confirmDialog('Delete this item?', 'It will be removed from the shared site.', 'confirm-delete-content', { id, kind });
      if (name === 'confirm-delete-content') { await store.api(`admin/content/${kind}`, 'DELETE', { id }); await store.load(); modal.close(); render(); toast('Item deleted.'); }
      if (name === 'edit-media') openDialog('Edit catalog title', manualForm(adminRows.find(m => m.id === id), true));
      if (name === 'refresh') { await store.load(); render(); }
      if (name === 'video') { const video = document.querySelector('[data-background-video]'); if (video.paused) { await video.play(); action.textContent = 'Pause background'; action.setAttribute('aria-label', 'Pause background video'); } else { video.pause(); action.textContent = 'Play background'; action.setAttribute('aria-label', 'Play background video'); } }
      if (name === 'video-audio') {
        const video = document.querySelector('[data-background-video]');
        if (!video) return;
        if (video.muted) {
          video.volume = 0.7;
          video.muted = false;
          try { await video.play(); updateVideoAudioButton(action, false); }
          catch { video.muted = true; updateVideoAudioButton(action, true); toast('Your browser blocked video sound. Tap Enable sound to try again.', true); }
        } else {
          video.muted = true;
          updateVideoAudioButton(action, true);
        }
      }
    });
  }
  const link = event.target.closest('a[href]');
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0 && !link.target && !link.hasAttribute('download')) {
    const url = new URL(link.href); if (url.origin === location.origin && !url.hash) { event.preventDefault(); navigate(url.pathname + url.search); }
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'library-search') { filters.query = event.target.value; document.querySelector('#library-results').innerHTML = libraryResults(); }
});
document.addEventListener('change', async event => {
  const input = event.target;
  if (input.id === 'library-sort') { filters.sort = input.value; document.querySelector('#library-results').innerHTML = libraryResults(); }
  if (input.id === 'calendar-season' || input.id === 'calendar-year') { if (input.id === 'calendar-season') season = input.value; else seasonYear = Number(input.value); await loadCalendar(); }
  if (!['avatar-file', 'poster-file', 'import-file', 'hero-video-file'].includes(input.id) || !input.files?.[0]) return;
  await busy(input, async () => {
    const file = input.files[0];
    if (input.id === 'import-file') {
      if (file.size > 2_000_000) throw new Error('Choose an export under 2 MB.');
      await store.importLibrary(JSON.parse(await file.text())); toast('Collection imported.'); render();
    } else {
      const kind = input.id === 'avatar-file' ? 'avatar' : input.id === 'hero-video-file' ? 'hero-video' : 'poster';
      const status = kind === 'hero-video' ? document.querySelector('#hero-upload-status') : null;
      if (status) status.textContent = `Uploading ${file.name} · 0%`;
      const url = await store.upload(file, kind, progress => { if (status) status.textContent = `Uploading ${file.name} · ${Math.round(progress.percentage)}%`; });
      if (input.id === 'avatar-file') { await store.updateProfile({ username: store.state.user.username, avatarUrl: url }); render(); toast('Avatar updated.'); }
      else if (input.id === 'poster-file') { modal.querySelector('[name="posterUrl"]').value = url; toast('Poster uploaded. Save the catalog entry to apply it.'); }
      else { await store.saveTheme({ ...store.state.theme, heroVideoUrl: url }); render(); toast('Landing video uploaded and saved.'); }
    }
  });
  input.value = '';
});
document.addEventListener('submit', event => {
  const form = event.target; event.preventDefault();
  busy(form, async () => {
    const data = Object.fromEntries(new FormData(form));
    if (form.id === 'manual-form' || form.id === 'media-form') {
      const media = { ...data, totalUnits: data.totalUnits ? Number(data.totalUnits) : null, globalRating: data.globalRating ? Number(data.globalRating) : null };
      if (form.id === 'media-form') { await store.api('admin/media', 'PATCH', { ...media, id: form.dataset.id }); await store.load(); modal.close(); render(); toast('Catalog title updated.'); }
      else { const entry = await store.addEntry(media); navigate(`/entry/${entry.id}`); toast('Added to your library.'); }
    }
    if (form.id === 'entry-form') { await store.updateEntry(form.dataset.id, { progress: Number(data.progress), status: data.status, personalScore: data.personalScore === '' ? null : Number(data.personalScore) }); render(); toast('Progress saved.'); }
    if (form.id === 'comment-form') { await store.postComment(form.dataset.id, data.body.trim()); form.reset(); await loadComments(form.dataset.id, navVersion); toast(store.mode === 'local' ? 'Note saved.' : 'Comment posted.'); }
    if (form.id === 'profile-form') { await store.updateProfile({ username: data.username.trim(), avatarUrl: data.avatarUrl || store.state.user.avatarUrl }); render(); toast('Profile saved.'); }
    if (form.id === 'theme-form') { const copy = Object.fromEntries(Object.entries(data).filter(([key])=>key.startsWith('copy_')).map(([key,value])=>[key.slice(5),value])); for (const key of Object.keys(data)) if (key.startsWith('copy_')) delete data[key]; data.copy = copy; await store.saveTheme(data); applyTheme(); await render(); toast('Appearance and page copy saved.'); }
    if (form.id === 'login-form') { await store.api('admin/login', 'POST', data); store.state.admin = true; navigate('/admin/dashboard/theme'); }
    if (form.id === 'content-form') {
      if (form.dataset.kind === 'schedule') { data.dayOfWeek = Number(data.dayOfWeek); data.episode = Number(data.episode); }
      await store.api(`admin/content/${form.dataset.kind}`, form.dataset.id ? 'PATCH' : 'POST', { ...data, ...(form.dataset.id ? { id: form.dataset.id } : {}) });
      await store.load(); modal.close(); render(); toast('Published successfully.');
    }
    if (form.id === 'discover-search' || form.id === 'modal-search') {
      const target = document.querySelector(form.id === 'discover-search' ? '#discover-results' : '#modal-results');
      if (form.id === 'discover-search') {
        discoverQuery = (data.q || '').trim(); discoverType = data.type;
        discoverFilters = { sort: data.sort || 'TRENDING_DESC', genre: data.genre || '', format: data.format || '', season: data.season || '', year: data.year || '', status: data.status || '' };
        await loadDiscovery();
      } else {
        target.innerHTML = '<div class="loading small">Searching the universe…</div>';
        try { if ((data.q || '').trim().length < 2) throw new Error('Type at least two characters to search.'); const response = await store.api(`search?q=${encodeURIComponent(data.q.trim())}&type=${encodeURIComponent(data.type)}&page=1`); if (!target.isConnected) return; modalSearchResults = response.results; target.innerHTML = modalSearchResults.length ? `<div class="search-results">${modalSearchResults.map((m,i)=>`<article class="search-result"><img src="${esc(imageUrl(m.posterUrl))}" alt="${esc(m.title)} poster" loading="lazy"><div><span class="eyebrow">${esc(m.type)} · ${m.globalRating == null ? 'UNRATED' : '★ '+m.globalRating.toFixed(1)}</span><h3>${esc(m.title)}</h3><p>${esc(m.synopsis?.slice(0, 150) || 'A new story for your collection.')}</p></div><button class="button secondary" data-action="modal-add" data-index="${i}">${icon('plus',16)} Add</button></article>`).join('')}</div>` : empty('No stories found', 'Try another title or format.'); }
        catch (error) { target.innerHTML = `<div class="notice"><p>${esc(error.message)}</p></div>`; }
      }
    }
  });
});
async function boot() {
  try { await store.load(); await render(); if (new URL(location.href).searchParams.get('add') === '1') addModal(); }
  catch (error) { main.innerHTML = `<div class="container narrow"><section class="panel setup-card"><img src="/assets/mark.svg" width="48" height="48" alt=""><h1>We couldn’t open your universe.</h1><p>${esc(error.message)}</p><button class="button primary" id="retry-boot">Try again</button></section></div>`; document.querySelector('#retry-boot').onclick = boot; }
}
boot();
