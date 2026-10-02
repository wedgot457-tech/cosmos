# Cosmos — an anime library for your circle

Cosmos is a responsive anime discovery and personal library app. It has an original cinematic entrance, paginated AniList discovery, a seasonal calendar, profile customization, a floating navigation dock, and portable collection backups. Production is deployed at https://cosmos-delta-three.vercel.app.

## Run locally

Use Node.js 24.x:

```sh
npm ci
npm start
```

Open `http://localhost:3001`. For development, `npm run dev` starts the same local server. Local mode works without service credentials and saves the profile and collection in the current browser's local storage. Browser storage is not shared between people or devices; export a backup to move a collection.

## Deploy the ZIP to Vercel

1. Extract this folder and upload its contents to your repository, or deploy the extracted folder using the Vercel CLI.
2. Import the repository into Vercel. Set the project root to this folder (the folder containing `package.json`), choose **Other**, and select Node.js **24.x**.
3. Vercel reads `vercel.json`; it builds the app and serves `public/` with the API function under `api/`.
4. For private, shared profiles and moderation, connect PostgreSQL and configure the environment variables below before deploying.

For the existing Cosmos production project, a public Blob store named `cosmos-media` is connected and `BLOB_READ_WRITE_TOKEN` is provisioned by Vercel. To set up another project, create/connect a public Blob store in Storage or run `vercel blob create-store cosmos-media --access public` from its linked directory. Vercel injects the token after connection; do not commit a token.

## Shared mode configuration

Create a PostgreSQL database. Add these values under Vercel Project Settings → Environment Variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | For shared mode | PostgreSQL connection string; use the provider's pooled URL at runtime when available. |
| `SESSION_SECRET` | For shared mode | Random secret of at least 32 characters for signed, HTTP-only sessions. |
| `ADMIN_PASSWORD` | For admin | Server-side admin credential of at least 12 characters. |
| `BLOB_READ_WRITE_TOKEN` | Required for uploads | Vercel Blob token; Vercel injects it when the `cosmos-media` store is connected. |
| `PORT` | Local only | Optional local server port; defaults to `3001`. |

Generate a session secret locally:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit real credentials or put them in browser code. To initialize/update the database schema, set `DATABASE_URL` in a local `.env` and run:

```sh
npm ci
npm run db:push
```

Review schema changes and use a separate database for previews. This update adds the nullable `SiteTheme.copy` JSONB field; `npm run db:push` applies it without replacing existing profile or library data. Alternatively, apply `prisma/migrations/20260928_add_site_theme_copy/migration.sql` before deploying the new application code. Configure Vercel Production/Preview variables and redeploy. AniList search uses its public GraphQL API through the app's server route; it can be rate limited or unavailable, and the UI provides loading/error/empty states and retry controls.

## Product boundaries

- Local mode is intentionally browser-local. It does not claim cross-device identity or shared social persistence.
- Connected mode stores stable user IDs, collections, comments, activity, and moderation state in PostgreSQL. An anonymous profile remains tied to its signed, HTTP-only browser session, which is renewed during use and lasts up to 10 years between visits. Reopening the site on that browser/device reuses the same profile ID. Clearing site data, using private browsing, or changing devices removes that browser session; use the JSON export/import flow to transfer library entries. There is no email/password recovery flow.
- The admin page is protected by a server-validated session and `ADMIN_PASSWORD`. Admins can inspect activity and block, unblock, ban, and unban accounts. Blocking prevents writes; banning denies account access.
- Admin appearance supports direct, resumable/multipart uploads of MP4, WebM, or QuickTime landing videos up to 5 GB. Avatars support PNG, JPEG, WebP, or GIF up to 10 MB; posters up to 25 MB. These go directly to the connected public Vercel Blob store, bypassing the 4.5 MB Function request limit. Vercel Blob supports individual blobs up to 5 TB; the app uses smaller per-kind limits.
- The seasonal calendar lists anime by AniList season/year and premiere date; it is not a live episode broadcast timetable. AniList's global score is distinct from private user ratings.
- Backups contain profile display metadata and library entries but no passwords, session credentials, or secrets. Import validates the file and merges entries without duplicate IDs.

## Checks

```sh
npm run lint
npm test
npm run build
```

`npm run build` generates Prisma Client and checks JavaScript syntax and deployment entry points. `npm test` runs the included unit tests.

## Main folders

- `public/` — Cosmos interface, styles, and original vector artwork
- `public/js/` — app views, interactions, AniList adapter, and browser library storage
- `api/` and `server/` — Vercel API entry point and server-side validation/persistence
- `prisma/` — PostgreSQL data models
- `tests/` — focused unit checks

The reference materials informed broad atmosphere and interaction goals only. Cosmos's identity and artwork are original to this implementation.
