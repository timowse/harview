# harview

> **Privacy-first HAR file inspector** — Grafana-style waterfall charts, request
> filtering, header redaction, and sanitized export. 100% client-side, zero uploads.

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Made with vanilla JS](https://img.shields.io/badge/made%20with-vanilla%20JS-f7df1e.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Uses D3.js](https://img.shields.io/badge/charts-D3.js%20v7-f68e2a.svg)](https://d3js.org)

---

## What is harview?

HAR (HTTP Archive) files are recorded by browser DevTools and capture every network
request made by a page — headers, timings, bodies and all. They are invaluable for
debugging performance issues, but also contain **sensitive data** (auth tokens, cookies,
API keys) that makes them tricky to share.

**harview** lets you:

- Explore your HAR file's requests in a beautiful, interactive waterfall chart
- Filter down to exactly the requests you care about
- Inspect every header and body inline
- **Redact** sensitive headers so they never appear in exports
- Download a clean, sanitized copy safe to hand to colleagues or support teams

Everything happens inside your browser. The file never leaves your machine.

---

## Features

| Feature | Details |
|---|---|
| Waterfall chart | Grafana-style timeline with per-phase colour coding (DNS, Connect, TLS, Send, Wait/TTFB, Receive) |
| Filtering | Filter simultaneously by URL substring, HTTP status class (2xx/3xx/4xx/5xx), MIME type, and HTTP method |
| Request inspector | Full request & response headers, timing breakdown with mini bar chart, body preview with JSON auto-formatting |
| Header redaction | Configurable redact list (ships with `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`); redacted values show as `[redacted]` in the inspector and are stripped from exports |
| Sanitized export | Downloads a valid `.har` file with redacted values replaced — safe to share |
| Zero dependencies (runtime) | Only D3.js v7 loaded from CDN for chart rendering; no frameworks, no build tools |
| No server | Pure client-side — open the HTML file directly or serve from any static host |

---

## Quick Start

### Option A — Open locally (no server needed)

```bash
git clone https://github.com/timowse/harview.git
cd harview
open index.html          # macOS
# xdg-open index.html    # Linux
# start index.html       # Windows
```

> Note: Firefox and some Chromium hardening settings block `file://` fetch. If the
> D3 CDN script is blocked, use Option B or serve locally.

### Option B — Serve with any static server

```bash
# Python 3
python3 -m http.server 8080

# Node (npx, no install needed)
npx serve .

# Caddy
caddy file-server --listen :8080
```

Then open `http://localhost:8080` in your browser.

### Option C — Deploy to GitHub Pages / Netlify / Vercel

Just point your hosting provider at the repo root — there is no build step.

---

## How to Use

1. **Open** `index.html` in any modern browser.
2. **Drop** a `.har` file onto the drop zone, or click **Browse file**.
3. The waterfall chart renders immediately. **Click any row** to open the inspector panel on the right.
4. Use the **filter bar** to narrow down by URL, status, type, or method.
5. Expand **Redact headers** to add header names you want hidden — they are masked in the inspector and stripped from exports.
6. Click **Export sanitized HAR** to download a clean copy.
7. Click **Load new file** to start over.

---

## Project Structure

```
harview/
├── index.html          # Single-page shell — no framework, no build step
├── css/
│   └── style.css       # Dark-mode design system
└── js/
    ├── parser.js       # HAR JSON → normalised entry records + timing data
    ├── filters.js      # URL/status/type/method filtering, redact list management
    ├── waterfall.js    # D3.js waterfall chart with phase-coloured bars
    ├── inspector.js    # Request detail panel (headers, timing, body)
    ├── exporter.js     # Sanitized HAR export with redaction applied
    └── main.js         # Entry point: drag & drop, FileReader, app orchestration
```

All modules use the **IIFE / revealing module pattern** — no bundler or transpiler
required. They can be trivially converted to ES modules if needed.

---

## Browser Support

| Browser | Minimum version |
|---|---|
| Chrome / Edge | 90+ |
| Firefox | 88+ |
| Safari | 15+ |

Requirements: `FileReader`, `URL`, `Blob`, `SVG`, `CSS custom properties`, `D3 v7`.

---

## Tech Stack

- **Vanilla JavaScript** (ES2020, no transpilation)
- **D3.js v7** — SVG waterfall chart (CDN, no install)
- **Pure CSS** — custom properties, flexbox, dark-mode first
- **FileReader API** — client-side file reading
- **Blob / createObjectURL** — in-browser file download

---

## Contributing

Contributions, bug reports, and feature requests are very welcome!

### Development setup

```bash
git clone https://github.com/timowse/harview.git
cd harview
# No install step — just edit and refresh
python3 -m http.server 8080
```

### Conventions

- Plain JS only, no build tools introduced without discussion
- All JS files follow the revealing-module IIFE pattern
- CSS custom properties for every colour / dimension
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`

### Sending a PR

1. Fork the repo
2. Create a branch: `git checkout -b feat/my-feature`
3. Make your changes and verify in Chrome + Firefox
4. Open a PR with a clear description of what and why

### Ideas welcome

- [ ] Highlight slowest N requests
- [ ] Sort by column (time, size, status)
- [ ] Group by domain
- [ ] Light mode toggle
- [ ] HAR diff (compare two files)
- [ ] Share via URL hash (base64-encoded, still client-side)
- [ ] Service worker for offline use

---

## License

[MIT](LICENSE) © Timotheus Wiese
