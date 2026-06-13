# BeatBox

BeatBox is a Node.js, Express, MySQL, and vanilla JavaScript music streaming and playlist management application. It combines a session-authenticated web UI, a normalized relational schema, Jamendo-backed track ingestion/playback, playlist curation, listening analytics, role-aware admin tooling, and an optional AI music assistant.

The application is intentionally implemented without a frontend framework. The browser client is plain HTML, CSS, and JavaScript, while the backend exposes JSON APIs under `/api/*` and serves the static app from `public/`.

## Repository Layout

```text
BeatBox/
  server.js                 Express entry point, middleware, static serving, route mounting, DB bootstrap
  db.js                     MySQL configuration, .env loading, root/admin/owner/user pool management
  package.json              Node metadata, npm scripts, dependency list
  db.config.json            Optional local MySQL root password config
  config.yml                Placeholder Cloudflare tunnel config file
  cloudflared.exe           Cloudflare tunnel binary
  ER diagram.pdf            Database ER diagram artifact
  database/
    schema.sql              Canonical schema: tables, indexes, view, stored procedure, trigger
    users.sql               MySQL users/grants for owner/admin/user role demo
    seed.sql.bak            Legacy seed data backup, not loaded automatically by server.js
  routes/
    auth.js                 Registration, login, logout, current session
    songs.js                Catalog listing, filters, likes, listens, liked songs
    playlists.js            Playlist CRUD, playlist songs, batch operations, recommendations
    admin.js                Admin stats, user roles, song/artist management, DB role diagnostics
    jamendo.js              Jamendo API proxy, catalog seeding, playback URL lookup
    ai.js                   BeatBot chatbot with RAG, LLM fallback chain, rule-based fallback
  public/
    index.html              Login page
    register.html           Registration page
    app.html                Authenticated SPA shell
    css/style.css           Dark music-player UI, layout, responsive styles
    js/auth.js              Login/register client logic
    js/app.js               Hash router and queue panel rendering
    js/dashboard.js         Discover and liked-songs UI
    js/playlist.js          Playlist UI, batch copy/queue/remove/paste flows
    js/player.js            HTML5 audio player and queue logic
    js/chatbot.js           BeatBot chat widget UI
    js/admin.js             Admin dashboard UI
```

## Runtime Stack

- Runtime: Node.js 18 or newer.
- HTTP server: Express 4.
- Database: MySQL 8 compatible server through `mysql2/promise`.
- Authentication: `express-session` plus bcrypt password hashes.
- Security middleware: `helmet`, `cors`, `express-rate-limit`, request body size limits, parameterized SQL.
- Validation/sanitization: `validator` and route-local trimming/format checks.
- Music source: Jamendo API, using `JAMENDO_CLIENT_ID`.
- AI providers: Gemini via `@google/generative-ai`; Mistral, Groq, and NVIDIA NIM through the OpenAI-compatible SDK.
- Frontend: static HTML/CSS/JS, native `<audio>`, hash-based routing, `fetch` APIs.

## Quick Start

### Prerequisites

- Node.js `>=18`
- MySQL running on `localhost`
- A MySQL root user that can create databases, tables, triggers, users, and grants
- Optional: a Jamendo client ID if you want automatic catalog seeding and playable stream URLs

### Install Dependencies

```bash
npm install
```

### Configure MySQL Access

BeatBox builds the MySQL root password from these sources, with later sources overriding earlier ones:

1. `db.config.json`
2. `--db-pass=...` command-line argument
3. `DB_PASSWORD` environment variable loaded from `.env`

Example `db.config.json`:

```json
{
  "password": "your_mysql_root_password"
}
```

Equivalent CLI form:

```bash
node server.js --db-pass=your_mysql_root_password
```

### Configure Optional Environment Variables

`db.js` contains a small built-in `.env` loader, so no `dotenv` package is required.

```env
# MySQL root password alternative to db.config.json
DB_PASSWORD=your_mysql_root_password

# Recommended for stable sessions across restarts
SESSION_SECRET=replace_with_a_long_random_secret

# Enables Jamendo catalog seeding and playback URL lookup
JAMENDO_CLIENT_ID=your_jamendo_client_id

# Optional BeatBot providers. The backend tries them in this order.
GEMINI_API_KEY=your_gemini_key
MISTRAL_API_KEY=your_mistral_key
GROQ_API_KEY=your_groq_key
NIM_API_KEY=your_nvidia_nim_key
```

### Run

```bash
npm start
```

The server listens on:

```text
http://localhost:3000
```

Primary pages:

- `http://localhost:3000/` - login
- `http://localhost:3000/register.html` - registration
- `http://localhost:3000/app.html#discover` - authenticated discover view
- `http://localhost:3000/app.html#playlists` - authenticated playlists view
- `http://localhost:3000/app.html#liked` - authenticated liked songs view
- `http://localhost:3000/app.html#admin` - owner/admin panel

## Startup Boot Sequence

`server.js` performs the complete application bootstrap:

1. Creates the Express app and binds to port `3000`.
2. Applies security and platform middleware:
   - Helmet with CSP and cross-origin embedder policy disabled for this app.
   - CORS.
   - JSON and URL-encoded body parsers limited to `100kb`.
   - Global rate limit of 200 requests per 15 minutes.
   - Session cookies with 24-hour lifetime, `httpOnly`, `sameSite: lax`, and `secure: false`.
3. Protects `/app.html` with a session check before static serving.
4. Serves `public/` as static frontend assets.
5. Mounts API routers:
   - `/api/auth`
   - `/api/songs`
   - `/api/playlists`
   - `/api/admin`
   - `/api/ai`
   - `/api/jamendo`
6. Calls `setupDatabase()`:
   - Connects as MySQL root without selecting a database.
   - Creates `beatbox` if it does not exist.
   - Reads and executes the non-`DELIMITER` portion of `database/schema.sql`.
   - Creates or replaces the `song_details` view.
   - Applies lightweight song-column migrations for `songs.image_url` and `songs.jamendo_id`.
   - Drops and recreates the `after_listen_insert` trigger.
   - Loads `database/seed.sql` only if that exact file exists and the song table is empty.
   - Executes `database/users.sql` to create MySQL role users and grants.
   - Initializes role-specific connection pools.
   - Calls `seedFromJamendo()` to populate real Jamendo tracks when configured.

## Database Architecture

The database is named `beatbox`. The schema is relational and uses foreign keys with cascading or nulling behavior to preserve referential integrity.

### Core Tables

| Table | Purpose |
| --- | --- |
| `genres` | Genre lookup table with unique `genre_name`. |
| `artists` | Artist metadata: `artist_name`, `country`, `debut_year`. |
| `albums` | Albums linked to artists with `ON DELETE SET NULL`. |
| `songs` | Catalog tracks with duration, release date, play count, Jamendo ID, image URL, and foreign keys to album/genre/artist. |
| `users` | Application users with bcrypt hashes, subscription type, join date, and app role. |
| `playlists` | User-owned playlist records. Deleted automatically when a user is deleted. |
| `playlist_songs` | Many-to-many playlist/song junction table with composite primary key. |
| `likes` | Many-to-many user/song favorites table. |
| `listens` | Listen events used for analytics and play-count updates. |
| `play_history` | Per-user playback history. |
| `payments` | Payment records linked to users. |

### Indexes

`schema.sql` creates indexes on common join/filter columns:

- `idx_songs_artist`
- `idx_songs_album`
- `idx_songs_genre`
- `idx_playlists_user`
- `idx_listens_user`
- `idx_listens_song`

### View

`song_details` pre-joins songs with artist, album, and genre metadata. The checked-in schema version includes:

- `song_id`
- `song_title`
- `duration`
- `release_date`
- `play_count`
- `image_url`
- `jamendo_id`
- `artist_name`
- `artist_id`
- `album_title`
- `album_id`
- `genre_name`
- `genre_id`

`server.js` also creates this view during startup, though its inline version omits `image_url` and `jamendo_id`.

### Stored Procedure

`GetTopSongs(IN limit_count INT)` returns the top songs ordered by `play_count`, joined with artist names. The schema contains this procedure, but `server.js` intentionally skips `DELIMITER` blocks during automatic startup. To install the stored procedure, run `database/schema.sql` directly in a MySQL client.

### Trigger

`after_listen_insert` runs after each insert into `listens` and increments the matching `songs.play_count`. The application records listens through `POST /api/songs/:id/listen`, then the database trigger handles the aggregate counter.

### MySQL Role Users

`database/users.sql` creates native MySQL users:

| MySQL User | Password | Privileges |
| --- | --- | --- |
| `beatbox_owner` | `owner123` | Full privileges on `beatbox.*` with grant option. |
| `beatbox_admin` | `admin123` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `beatbox.*`. |
| `beatbox_user` | `user123` | `SELECT` on all tables plus targeted write access to user-owned interaction tables. |

`db.js` starts with a root-backed admin pool for setup, then replaces role pools through `initRolePools()` after users/grants are created.

## Authentication and Authorization

### Application Roles

Users have a `role` enum:

- `owner`
- `admin`
- `user`

Registration defaults new users to `user`. `routes/auth.js` contains a development shortcut that assigns `owner` when the submitted name or email contains `adit`.

### Sessions

On login or registration, the backend stores:

- `req.session.userId`
- `req.session.role`

The frontend also stores a copy of the user object in `localStorage` under `beatbox_user` for UI convenience, but the server-side session is the authority for protected API access.

### Passwords

Passwords are hashed with bcrypt using a cost factor of `10`. Login compares the submitted password with `bcrypt.compare()`.

### Protected Areas

- `/app.html` requires an authenticated session.
- Playlist mutations require login.
- Likes and listen recording require login.
- Admin APIs require a session role of `owner` or `admin`.
- User role changes require `owner`.

## API Reference

All endpoints return JSON unless redirecting browser navigation from a protected static page.

### Auth API

| Method | Endpoint | Body / Query | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | `{ name, email, password }` | Creates a user, hashes password, creates a session. |
| `POST` | `/api/auth/login` | `{ email, password }` | Authenticates and creates a session. |
| `POST` | `/api/auth/logout` | none | Destroys the session and clears `connect.sid`. |
| `GET` | `/api/auth/me` | none | Returns `{ loggedIn, user }` for the current session. |

Auth routes use a stricter limiter: 10 attempts per 15 minutes.

### Songs API

| Method | Endpoint | Body / Query | Description |
| --- | --- | --- | --- |
| `GET` | `/api/songs` | `artist`, `genre`, `album`, `search`, `sort` | Lists songs with joins and per-user `is_liked`. Sort values: `popular`, `newest`, `title`. |
| `GET` | `/api/songs/artists` | none | Lists artists ordered by name. |
| `GET` | `/api/songs/genres` | none | Lists genres ordered by name. |
| `GET` | `/api/songs/albums` | none | Lists albums with artist names. |
| `POST` | `/api/songs/:id/like` | none | Toggles the current user's like for a song. |
| `POST` | `/api/songs/:id/listen` | none | Inserts into `listens` and `play_history`; trigger increments play count. |
| `GET` | `/api/songs/liked` | none | Lists the current user's liked songs. |

The listing route filters hidden artists using `artists.is_hidden`, but the checked-in schema does not currently create that column. See "Implementation Notes" below.

### Playlists API

| Method | Endpoint | Body / Query | Description |
| --- | --- | --- | --- |
| `GET` | `/api/playlists` | none | Lists current user's playlists with song counts. |
| `POST` | `/api/playlists` | `{ playlist_name }` | Creates a playlist for the current user. |
| `GET` | `/api/playlists/:id/songs` | none | Lists songs in a playlist with liked status. |
| `POST` | `/api/playlists/:id/songs` | `{ song_id }` | Adds one song after verifying playlist ownership. |
| `POST` | `/api/playlists/:id/songs/batch` | `{ song_ids: [] }` | Batch-adds songs with `INSERT IGNORE`. |
| `DELETE` | `/api/playlists/:id/songs/batch` | `{ song_ids: [] }` | Batch-removes songs with a dynamic `IN (...)` clause. |
| `DELETE` | `/api/playlists/:id/songs/:songId` | none | Removes one song from a playlist. |
| `DELETE` | `/api/playlists/:id` | none | Deletes a playlist owned by the current user. |
| `GET` | `/api/playlists/:id/recommendations` | none | Recommends up to five songs using shared genre/artist features. |

Playlist routes use a 100 requests per 15 minutes limiter.

### Admin API

| Method | Endpoint | Body / Query | Description |
| --- | --- | --- | --- |
| `GET` | `/api/admin/stats` | none | Counts users, songs, artists, playlists, and listens. |
| `GET` | `/api/admin/songs` | none | Lists all songs with artist, album, and genre metadata. |
| `POST` | `/api/admin/songs` | `{ title, duration, release_date, album_id, genre_id, artist_id }` | Adds a song manually. |
| `DELETE` | `/api/admin/songs/:id` | none | Deletes a song. |
| `POST` | `/api/admin/artists` | `{ artist_name, country, debut_year }` | Adds an artist. |
| `GET` | `/api/admin/users` | none | Lists users and app roles. |
| `POST` | `/api/admin/users/:id/role` | `{ role: "admin" \| "user" }` | Owner-only role update. |
| `GET` | `/api/admin/artists-list` | none | Lists artists with visibility status. |
| `POST` | `/api/admin/artists/:id/toggle-hide` | none | Toggles `artists.is_hidden`. |
| `GET` | `/api/admin/db-roles` | none | Shows grants for `beatbox_owner`, `beatbox_admin`, and `beatbox_user`. |
| `POST` | `/api/admin/test-role` | `{ role, operation }` | Tests read/write/create-table/create-user permissions using role pools. |

Admin routes use a 100 requests per 15 minutes limiter.

### Jamendo API

| Method | Endpoint | Body / Query | Description |
| --- | --- | --- | --- |
| `GET` | `/api/jamendo/search` | `q`, `limit`, `offset` | Proxies Jamendo track search. |
| `GET` | `/api/jamendo/tracks` | `limit`, `offset`, `order` | Proxies Jamendo track listing with `include=musicinfo`. |
| `GET` | `/api/jamendo/tracks/:id` | none | Fetches one Jamendo track by ID. |
| `GET` | `/api/jamendo/play/:id` | none | Resolves a Jamendo track to `audio_url`, `download_url`, image, and local song metadata. |
| `GET` | `/api/jamendo/artists` | `limit`, `offset` | Proxies Jamendo artists. |
| `GET` | `/api/jamendo/albums` | `limit`, `offset` | Proxies Jamendo albums. |
| `POST` | `/api/jamendo/seed` | none | Runs Jamendo seeding manually. |

Jamendo requests require `JAMENDO_CLIENT_ID`. Startup seeding fetches up to five pages of 200 popular weekly tracks, normalizes genre/artist/album/song data, and stores Jamendo IDs plus cover art URLs.

### AI API

| Method | Endpoint | Body / Query | Description |
| --- | --- | --- | --- |
| `POST` | `/api/ai/recommend` | `{ message }` | Sends a user message to BeatBot and returns `{ response, songs, redirect }`. |

BeatBot uses:

1. Request sanitization with a 1000-character cap.
2. User context lookup: role, subscription, listen count, playlist count, like count.
3. RAG-style catalog retrieval from the MySQL song database.
4. Provider fallback chain:
   - Gemini `gemini-2.0-flash`
   - Mistral `mistral-small-latest`
   - Groq `llama-3.1-8b-instant`
   - NVIDIA NIM `meta/llama-3.1-8b-instruct`
   - Rule-based local recommender
5. In-memory chat history keyed by user ID or anonymous session ID.
6. History TTL of 30 minutes with periodic cleanup.

The AI route is rate-limited to 5 requests per 15 minutes.

## Frontend Architecture

The frontend is a static SPA-style app served from `public/`.

### Pages

- `index.html`: login form, loads `js/auth.js`.
- `register.html`: registration form, loads `js/auth.js`.
- `app.html`: authenticated shell with sidebar, main views, bottom player, queue panel, chatbot, modals, and scripts.

### Hash Routes

`public/js/app.js` controls the main hash router:

- `#discover`: song discovery table
- `#playlists`: playlist grid/detail workflow
- `#liked`: liked songs view using the discover table
- `#admin`: admin dashboard

The router toggles `.view-section.active` and invokes module init functions such as `initDiscoverView()`, `initPlaylistsView()`, and `initAdminView()`.

### Discover and Liked Songs

`public/js/dashboard.js` handles:

- Session check through `/api/auth/me`.
- Sidebar user display.
- Admin nav reveal for `owner` and `admin`.
- Genre loading.
- Search debounce.
- Sort and genre filtering.
- Client-side pagination with `PAGE_SIZE = 30`.
- Song rendering with cover art placeholders.
- Like/unlike buttons.
- Add-to-playlist modal.
- Playback handoff to `Player`.
- Liked songs view through `/api/songs/liked`.
- Logout flow.

### Playlists

`public/js/playlist.js` handles:

- Playlist grid loading and creation modal.
- Playlist detail view.
- Add-song search.
- Playlist-local filtering by search text, genre, and sort mode.
- Shuffle play.
- Multi-select mode.
- Batch copy to `localStorage` under `beatbox_clipboard`.
- Batch paste to another playlist.
- Batch queue.
- Batch removal through the playlist batch delete API.
- Recommendation rendering from `/api/playlists/:id/recommendations`.

### Audio Player

`public/js/player.js` wraps the native HTML5 `<audio>` element and exposes a global `Player` module.

It supports:

- Fetching playable stream URLs from `/api/jamendo/play/:jamendo_id`.
- Play/pause, previous, next.
- Progress display and seek by clicking the progress bar.
- Volume and mute.
- Current context queue from discover or playlist views.
- Separate user queue.
- Automatic next-track behavior.
- Listen recording through `/api/songs/:song_id/listen`.

Only songs with `jamendo_id` are directly playable through the current implementation. Manually added admin songs without Jamendo IDs can appear in the catalog but will not play unless extended with an audio source.

### Admin Panel

`public/js/admin.js` powers:

- Stats cards.
- Song list and manual song add/delete.
- Artist visibility table.
- User list and owner-only role changes.
- MySQL grant display.
- DB role test buttons.

### Chatbot

`public/js/chatbot.js` provides the floating BeatBot UI. It posts chat messages to `/api/ai/recommend`, renders the response, displays suggested song chips, and optionally renders a navigation button when the backend returns a `redirect`.

## Security Model

Implemented controls:

- Bcrypt password hashing.
- Server-side sessions with HTTP-only cookies.
- Route-specific and global rate limiting.
- Body size limits.
- Parameterized SQL in route handlers.
- MySQL privilege separation through role-specific users.
- Ownership checks before mutating playlist contents.
- Owner-only user role management.
- Helmet security headers.
- Input trimming and low-character stripping in selected paths.
- API keys remain server-side and are never sent to the browser.

Development caveats:

- `secure: false` is correct for local HTTP but should be `true` behind HTTPS in production.
- CSP is disabled in Helmet for local simplicity.
- Sessions use the default in-memory store, which is not suitable for multi-process or production deployments.
- `cors()` is open by default.

## Data and Seeding Behavior

There are two possible catalog sources:

1. `database/seed.sql`, if present.
2. Jamendo seeding through `JAMENDO_CLIENT_ID`.

In this checkout, the file present is `database/seed.sql.bak`, not `database/seed.sql`, so `server.js` will not load it automatically. Jamendo seeding is therefore the normal way to populate playable songs.

Jamendo seed normalization:

- Inserts genres using the first Jamendo musicinfo genre tag, falling back to `Other`.
- Inserts artists by `track.artist_name`, falling back to `Unknown Artist`.
- Inserts albums by `track.album_name`, falling back to `Unknown Album`.
- Inserts songs with:
  - `title`
  - `duration`
  - `release_date`
  - `album_id`
  - `genre_id`
  - `artist_id`
  - `image_url`
  - `jamendo_id`

`songs.jamendo_id` is unique, so repeat seeding avoids duplicate Jamendo tracks.

## Implementation Notes and Current Gaps

These are details visible in the current files that matter when running or extending the project:

- `routes/songs.js`, `routes/playlists.js`, and `routes/admin.js` reference `artists.is_hidden`, but `database/schema.sql` does not define that column. Add a migration such as `ALTER TABLE artists ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;` before using artist visibility features.
- `database/seed.sql.bak` is legacy backup data and is not loaded by startup. It also inserts into `users.is_admin`, while the current `users` table uses `role`; update it before renaming it to `seed.sql`.
- `server.js` skips stored procedure creation because it only executes the schema content before the first `DELIMITER`. Run `database/schema.sql` manually if the stored procedure is required.
- `routes/auth.js` receives `date_of_birth` from the registration page but does not insert it into the `users` table.
- The registration form placeholder mentions password strength, but backend registration currently only checks presence, not length or complexity.
- The server-level `requireAdmin()` helper checks `req.session.isAdmin`, but login/registration store `req.session.role`; admin API routes use their own role-based middleware and are the effective admin gate.
- `chatbot.js` maps some legacy redirect paths such as `/dashboard.html` and `/playlist.html`; the current app routes are hash routes under `app.html`.
- Manual admin-added songs do not include `jamendo_id` or an audio URL, so they are catalog records but not playable through the Jamendo playback path.

## Useful Development Commands

```bash
npm start
```

Starts the server with the production/default script.

```bash
npm run dev
```

Currently identical to `npm start`; both run `node server.js`.

```bash
node server.js --db-pass=your_mysql_root_password
```

Starts the server with an explicit MySQL root password.

## Suggested Manual Verification

After startup:

1. Open `/register.html` and create a user.
2. Confirm `/app.html#discover` loads after registration.
3. Confirm `/api/auth/me` returns the logged-in user.
4. If `JAMENDO_CLIENT_ID` is configured, verify songs are loaded and Jamendo-backed playback works.
5. Like a song and verify it appears in `#liked`.
6. Create a playlist, add songs, remove one song, then try batch select/remove.
7. Play a Jamendo-backed song and confirm `listens` receives a row and `songs.play_count` increments.
8. Register or log in as an owner/admin, open `#admin`, and verify stats, users, songs, and DB role diagnostics.

## License and External Services

No license file is currently included. Jamendo content and API usage are governed by Jamendo's own API terms. AI provider usage depends on the provider keys configured in `.env`.
