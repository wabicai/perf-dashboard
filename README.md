# Perf Dashboard

Performance analytics for OneKey — Cloudflare Worker (D1) backend + React/Recharts dashboard.

## 🔗 线上地址

| 服务 | 地址 |
|------|------|
| **Dashboard**（看图表） | https://perf-dashboard.pages.dev |
| **Worker API** | https://perf-analytics.kaisheng-cai.workers.dev/api/health |
| **Cloudflare D1**（看数据） | https://dash.cloudflare.com → Storage & Databases → D1 → `perf-analytics` |
| **代码仓库** | https://github.com/wabicai/perf-dashboard |

## Architecture

```
app-monorepo CI jobs
  → POST /ingest/job      (notify.js)
  → POST /ingest/session  (run-*.js, per session)

Cloudflare Worker (worker/)
  ← GET  /api/trend
  ← GET  /api/compare
  ← GET  /api/functions
  ← GET  /api/regressions
  ← GET  /api/summary
  ← GET  /api/platforms

React Dashboard (dashboard/)
  deployed to Cloudflare Pages
```

## 1. Deploy the Worker

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and logged in
- A Cloudflare account

### Install dependencies

```bash
yarn install
```

### Create the D1 database

```bash
cd worker
npx wrangler d1 create perf-analytics
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "perf-analytics"
database_id = "YOUR_DATABASE_ID_HERE"   # ← replace this
```

### Initialize the schema

```bash
# Local (for dev)
yarn db:init

# Remote (production)
yarn db:init:remote
```

### Set secrets

```bash
# Optional auth secret — if set, POST endpoints require x-perf-secret header
npx wrangler secret put PERF_SECRET
```

### Deploy

```bash
yarn deploy:worker
# → https://perf-analytics.<your-subdomain>.workers.dev
```

### Local dev

```bash
yarn dev:worker
# → http://localhost:8787
```

---

## 2. Deploy the Dashboard

### Build

```bash
cp dashboard/.env.example dashboard/.env.local
# Edit dashboard/.env.local: VITE_WORKER_URL=https://perf-analytics.<your-subdomain>.workers.dev
yarn build
```

### Deploy to Cloudflare Pages

```bash
npx wrangler pages deploy dashboard/dist --project-name perf-dashboard
```

Or connect the repo to Cloudflare Pages in the dashboard with:

- **Build command**: `yarn build`
- **Build output directory**: `dashboard/dist`
- **Root directory**: `.` (repo root)
- **Environment variable**: `VITE_WORKER_URL=https://perf-analytics.<your-subdomain>.workers.dev`

### Local dev

```bash
yarn dev:dashboard
# → http://localhost:5173 (proxies /api/* to the worker)
```

---

## 3. Configure app-monorepo CI

Add these environment variables to your CI job (GitHub Actions, etc.):

```env
PERF_ANALYTICS_URL=https://perf-analytics.<your-subdomain>.workers.dev
PERF_ANALYTICS_SECRET=<same value as PERF_SECRET>
```

If `PERF_ANALYTICS_URL` is not set, analytics ingestion is silently skipped — it won't break CI.

---

## API Reference

All `GET` endpoints are public. `POST` endpoints require `x-perf-secret` header if `PERF_SECRET` is configured.

| Method | Path | Params |
|--------|------|--------|
| POST | `/ingest/job` | JSON body (see analytics.js) |
| POST | `/ingest/session` | JSON body (see analytics.js) |
| GET | `/api/platforms` | — |
| GET | `/api/summary` | — |
| GET | `/api/trend` | `platform`, `days` (default 30) |
| GET | `/api/compare` | `from`, `to` (YYYY-MM-DD), `platform` |
| GET | `/api/functions` | `platform`, `days` (default 7), `limit` (default 20) |
| GET | `/api/regressions` | `platform`, `days` (default 30) |
| GET | `/api/marks` | `session_id` or `job_id` |
| GET | `/api/health` | — |

---

## Dashboard Features

- **Trend** — Line chart of startup / refresh / fn-call metrics over time, per platform
- **Compare** — Bar chart comparing two date ranges (A vs B), with delta % table
- **Functions** — Sortable table of top slow functions ranked by avg p95ms
- **Regressions** — Timeline of regression/failure events with metric pills and deltas
- **Summary cards** — Latest job status per platform shown in the header
