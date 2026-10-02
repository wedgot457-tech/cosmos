# Cosmos feature guide

## Included

- Cinematic ENTER landing screen with original scenery illustration, optional hosted video background, responsive layout, and reduced-motion support.
- Anime discovery/search backed by the AniList GraphQL API, poster cards, title details, and local fallback content.
- Personal anime library with statuses, ratings, progress, notes, filtering, sorting, and grid/list layouts.
- Profile name/avatar customization, generated stable profile ID, personal appearance controls, and JSON export/import.
- Seasonal schedule, community-friendly comments in connected mode, account activity, and a liquid-glass inspired floating navigation bar.
- Optional PostgreSQL persistence, signed sessions, Vercel Blob uploads, protected admin panel, site settings, user activity review, and account block/ban controls.

## Persistence modes

| Capability | Browser-local mode | Connected mode |
| --- | --- | --- |
| Personal library/profile | Current browser storage | PostgreSQL + session cookie |
| Multiple people sharing content | No | Yes |
| Admin users, activity, moderation | No | Yes, password-protected server session |
| Poster/avatar uploads | Browser image data or URL | Persistent Blob when configured |
| Cross-device recovery | Export/import entries | Export/import entries; anonymous identity is still browser-bound |

## Intentional limits

This standalone edition is designed to deploy from the ZIP and does not presume credentials are already configured. Local browser mode is useful immediately but is not production persistence. Connect PostgreSQL and (for persistent uploads) Vercel Blob to enable shared operation.

There is no email/password account recovery or friend invitation system in this version. Import transfers library data to the current profile; it does not transfer a database account/session. Collection snapshots, richer privacy scopes, fully dycosmosc release calendars, and video upload UI remain future product work. The admin hero uses a hosted URL so media lives in persistent storage.
