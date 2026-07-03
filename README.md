# I Go to School by Bus 🚌

A point-to-point Hong Kong bus ETA app — ad-free, no backend, instant lookups.

Enter an origin and destination and instantly get every direct bus route between them, sorted by soonest arrival and updated in real time. Covers KMB and Citybus (CTB), with jointly-operated routes merged into a single entry.

Data comes directly from the Hong Kong Government's open API (DATA.GOV.HK). There is no server, no API key, no tracking, and no ads.

## Features

- **Point-to-point search** — pick an origin and destination by GPS or by typing a place / stop name (English or Chinese) to find all direct routes.
- **Real-time ETA** — arrival times are fetched from the official open API and refresh automatically every 30 seconds.
- **Joint-route merging** — routes operated jointly by KMB and Citybus are matched and shown as one.
- **Fare display** — see the fare for each route.
- **Route lookup** — enter a route number to view its stops and arrival times.
- **Favourites** — save frequent trips or routes for one-tap access, with live arrivals on the favourites tab.
- **Bottom navigation** — Point-to-point, Route lookup, and Favourites tabs.
- **Light / dark themes** — follows the system preference, with a manual toggle.
- **PWA** — installable and works offline (route data is cached); updates automatically on next reload after a deploy.
- **iOS home-screen widget (optional)** — shows the next buses for your first saved trip.

## Getting started

The app lives in the [`app/`](app/) directory.

```bash
cd app
npm install
npm run dev      # development → http://localhost:5173
```

Other commands:

```bash
npm run build    # production build → dist/
npm run data     # refresh route / stop snapshots → public/data/*.json
npm run smoke    # test search logic + live ETA
npm run lint     # oxlint
```

## How it works

- **Static snapshots** — routes, stops, and route-stop sequences are fetched once at build time and stored as JSON (Citybus has no bulk API, so a snapshot is required). Run `npm run data` only when route data changes.
- **Live ETA** — the browser calls the official open API (`data.etabus.gov.hk` / `rt.data.gov.hk`) directly; no server, no key.
- **Point-to-point search** — for each end, nearby stops are found; any route that passes the origin stop *before* the destination stop is a candidate, then ranked by ETA.

> Note: first/last-bus times and vehicle occupancy are not available from the government open data, so they are not included.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · PWA (`vite-plugin-pwa`) · Capacitor (for iOS packaging).

Data source: Hong Kong Special Administrative Region Government open data (DATA.GOV.HK).

## Deployment (GitHub Pages)

Pushing to `main` deploys automatically via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (the workflow assumes the app is in `app/`):

1. Repo Settings → Pages → Source → **GitHub Actions**
2. Each push to `main` publishes a new version at `https://<username>.github.io/<repo>/`

On iPhone: open the link in Safari → Share → **Add to Home Screen** for a full-screen, app-like experience with GPS.

## iOS App Store / widget

The app can be wrapped with [Capacitor](https://capacitorjs.com) without changing the web code. See:

- [`app/APPSTORE.md`](app/APPSTORE.md) — generating the iOS project and publishing
- [`app/WIDGET.md`](app/WIDGET.md) — setting up the iPhone home-screen widget
