# YURE — Japan seismic atlas

Vue 3 + Vuetify 3, a real 47-prefecture SVG map, and a Node.js SQLite API. The default installation uses **synthetic demonstration events**, never a real-time earthquake feed.

## Run

Requires Node.js 24 or newer (uses built-in `node:sqlite`).

```powershell
npm install; npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the local API on port 3001. Stop both processes with Ctrl+C.

Production:

```powershell
npm run build; npm start
```

Open http://127.0.0.1:3001. The API binds to loopback by default. Use a properly configured reverse proxy with authentication, HTTPS, and request limits before exposing a deployment publicly.

```powershell
npm test
```

## Docker

One multi-stage image serves both the compiled frontend and the SQLite API. The build runs tests before compiling. The runtime runs as the non-root `node` user, includes a database health check, and listens on port 3001. Images do not contain your local database, `.env`, or credentials.

Build and run locally:

```powershell
docker build --tag japan-shaking:local .; docker run --detach --name japan-shaking --publish 127.0.0.1:3002:3001 --volume japan-shaking-data:/app/data japan-shaking:local
```

Open http://127.0.0.1:3002. The named volume preserves the demo database when replacing the container. `docker logs japan-shaking` shows startup errors; `docker inspect --format '{{.State.Health.Status}}' japan-shaking` checks health.

To use your own database instead, mount its directory read-only and set `DB_PATH` to the **container** path. Ensure the database and directory are readable by container UID 1000. Stop/checkpoint any writer before copying a SQLite database; if using WAL, mount the whole directory with its sidecars.

```powershell
docker run --detach --name japan-shaking-archive --publish 127.0.0.1:3002:3001 --mount 'type=bind,source=C:\data,target=/archive,readonly' --env DB_PATH=/archive/earthquakes.sqlite japan-shaking:local
```

Use one of these examples at a time: both use host port 3002. `HOST` and `PORT` are configurable; the image sets `HOST=0.0.0.0` so Docker port forwarding works. Direct Node launches still bind to loopback by default. Keep the published host port on loopback behind a configured reverse proxy for public deployment.

### GitHub Actions / Docker Hub

The workflow in `.github/workflows/docker.yml`:

- Builds a Linux AMD64 image and runs API/search tests inside the build.
- Starts the image and verifies the health endpoint, compiled frontend, and SQLite-backed records before publishing.
- Runs on pull requests **without publishing or using Docker Hub credentials**.
- Publishes on pushes to `main` / `master`, version tags such as `v1.2.3`, and manual workflow dispatch.
- Uses commit-pinned official actions and GitHub's build cache.

Add these **repository Actions secrets** in GitHub Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | Your Docker Hub user/namespace |
| `DOCKERHUB_TOKEN` | Docker Hub access token with write access to the image repository |

Create the `japan-shaking` repository in that Docker Hub namespace. Optionally set the **Actions variable** `DOCKERHUB_REPOSITORY` to a different repository name. No token belongs in source control or Docker build arguments.

Published image: `docker.io/<DOCKERHUB_USERNAME>/japan-shaking`. Tags include `sha-<full commit>`, branch names, `latest` for the default branch, and `1.2.3` / `1.2` for a `v1.2.3` release. Stable version releases also update `latest`; prereleases do not. If your default branch is not `main` or `master`, update the workflow branch filter.

To run a published image, replace `YOUR_DOCKERHUB_USERNAME`:

```powershell
docker run --detach --name japan-shaking --publish 127.0.0.1:3002:3001 --volume japan-shaking-data:/app/data docker.io/YOUR_DOCKERHUB_USERNAME/japan-shaking:latest
```

## Connecting your SQLite archive

Demo data is created in `data/demo.sqlite` on the first launch, with event times relative to that launch. It persists across restarts. To regenerate dates, stop the API, delete only `data/demo.sqlite`, and restart.

Set `DB_PATH` to an existing SQLite file, then restart. External files are opened **read-only**, never seeded or migrated. The API fails explicitly if the schema doesn't match. If your existing table uses different fields, adapt the queries in `server/app.mjs` or provide these tables/views:

```sql
CREATE TABLE earthquakes (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  location TEXT NOT NULL,
  location_ja TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  depth_km REAL NOT NULL,
  magnitude REAL NOT NULL
);
CREATE TABLE observations (
  earthquake_id INTEGER NOT NULL REFERENCES earthquakes(id),
  prefecture TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 9),
  PRIMARY KEY (earthquake_id, prefecture)
);
CREATE INDEX earthquakes_time ON earthquakes(occurred_at);
```

```powershell
$env:DB_PATH = 'C:\data\earthquakes.sqlite'; npm run dev
```

- Store timestamps as ISO 8601 **with a UTC offset** (prefer `2026-11-17T02:00:00.000Z`). Windows use SQLite date parsing, inclusive start and end, and exclude future events. All UI timestamps use Asia/Tokyo.
- Coordinates are WGS84 decimal degrees; depth is kilometers. Magnitude and observed intensity are distinct.
- `prefecture` must match the Japanese map name, e.g. `東京都`, `北海道`, `福島県`. `/api/earthquakes?days=7` includes all 47 accepted names.
- `intensity` is an **ordinal JMA rank**, not magnitude: `1→1`, `2→2`, `3→3`, `4→4`, `5→5 lower`, `6→5 upper`, `7→6 lower`, `8→6 upper`, `9→7`. Unknown intensity is represented by **no observation**, not zero.
- A single epicenter and event magnitude cannot tell you the observed intensity of each prefecture. Your database needs the per-prefecture observations for faithful shaking previews. The demo supplies synthetic observations.
- API supports `days=1|7|30|365`, returns newest-first events with nested observations and derived maximum intensity. No automatic live polling is performed; changing the window or retrying fetches fresh records.
- The map and history table appear directly below a compact header, with a subtle rising-sun background behind the map.
- Search and magnitude filters affect the map, statistics, and event list together. Hover/focus previews a footprint; click pins it; Escape on an event or Clear removes the selection. Map epicenters are keyboard-operable. Zoom in to drag/pan. Motion can be paused and respects OS reduced-motion.
- Search also matches affected prefectures from observations, in Japanese or English (for example `東京`, `Tokyo`, or `Tokyo prefecture`), even if the epicenter has a different name.
- Map hover cards show full event dates and times in JST. Prefecture summaries show the strongest observed event (most recent on ties), with its local intensity; pinned previews show that event's observation. Epicenter cards show the event's maximum intensity. The history detail also shows the full timestamp when previewing a row.
- The default map shows the maximum observed intensity per prefecture in the selected window. A selected event animates each affected prefecture according to **its own** observation rank. Unobserved prefectures remain neutral.
- Main-island Okinawa uses a labeled inset. Remote islands are omitted; boundaries are illustrative, not for legal/navigation use.

## Map attribution

Administrative boundary data is based on **National Land Numerical Information (Administrative Areas), Ministry of Land, Infrastructure, Transport and Tourism, Japan**, processed and simplified by SmartNews Media Research Institute. This project adjusts ring winding for display and omits remote polygons from rendering.

- Source: https://nlftp.mlit.go.jp/ksj/
- Simplified data and usage terms: https://github.com/smartnews-smri/japan-topography
- Downloaded file: `data/municipality/geojson/s0001/prefectures.json`

Google Fonts are optional external font requests; local serif/sans-serif fallbacks work without them. The map and database are local. The decorative red sun with radiating rays is inline SVG, not an external image.
