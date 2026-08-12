# matiascevallos.github.io

Personal website and project portfolio for Matias Cevallos.

## Airport Prototype

An experimental, mobile-first Mapbox + browser geolocation field-testing tool for measuring indoor GPS accuracy and comparing Mapbox walking-time predictions against actual walk duration. Initial tests are designed for Vancouver International Airport (YVR) landside/pre-security areas.

This is an engineering experiment, not a polished consumer product. All data stays in the browser unless you export JSON manually.

### Setup

1. Install dependencies:

```bash
npm install
```

2. Configure your **public** Mapbox token (must start with `pk.`, never `sk.`):

**Option A — GitHub Pages / production**

```bash
cp airport-prototype/config.example.js airport-prototype/config.js
```

Edit `airport-prototype/config.js` and replace `pk.YOUR_PUBLIC_TOKEN_HERE` with your public token.

`config.js` is gitignored — do not commit your token file if you prefer to inject it at deploy time.

**Option B — Local Vite development**

Create a `.env` file in the project root:

```
VITE_MAPBOX_TOKEN=pk.your_public_token_here
```

Vite reads this at dev/build time via `import.meta.env.VITE_MAPBOX_TOKEN`.

3. Build the prototype (required before GitHub Pages deploy):

```bash
npm run build
```

Commit the generated files under `airport-prototype/` (including `index.html` and `assets/`).

### Local development

```bash
npm run dev
```

Open:

**http://localhost:5173/**

(relative path `/airport-prototype/` when serving the full site locally with any static server)

### Production (GitHub Pages)

After building and pushing to `main`, the prototype is available at:

**https://matiascevallos.github.io/airport-prototype/**

Ensure `airport-prototype/config.js` exists on the deployed branch (create it on your machine before deploy, or add it via your deployment process without committing if you use a private deploy step).

### Mobile testing

- Use Safari (iOS) or Chrome (Android) over **HTTPS** in production
- Allow location permission when prompted — the page does not request it until you tap **Use my location**
- Keep the page open and visible during walking tests when possible
- Switching apps or locking the phone may interrupt browser geolocation updates — visibility events are logged to investigate this
- Manually confirm arrival with **I've Arrived** — the app never auto-ends a test based on GPS proximity alone

### Data export

After completing a walking or stationary test, tap **Export test data** to download a JSON file containing all raw GPS samples, waypoints, visibility events, statistics, and feedback.

Example filenames:

- `yvr-walking-test-2026-08-12T180000Z.json`
- `yvr-stationary-test-2026-08-12T180000Z.json`

### Privacy

- Raw test data is stored in `localStorage` only
- No backend, database, or analytics telemetry is used
- Mapbox receives coordinates only for map tiles and directions requests
- Export JSON manually when you want to save results

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Typecheck and build prototype to `airport-prototype/` |
| `npm run test` | Run unit tests (Vitest) |
| `npm run preview` | Preview production build locally |

### Limitations

- Mapbox `mapbox/walking` routing may not understand indoor YVR terminal geometry — tracking-only mode is supported when no route is available
- Browser geolocation accuracy indoors is typically poor (tens of metres)
- No floor detection; GPS cannot reliably distinguish levels
- Browser timestamps are used (no server-authoritative time in this prototype)
