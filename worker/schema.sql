-- Perf Analytics D1 Schema
-- Run via: wrangler d1 execute perf-analytics --file=schema.sql

-- ── Job level (one row per CI run) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS perf_jobs (
  job_id           TEXT PRIMARY KEY,
  platform         TEXT NOT NULL,   -- 'ios' | 'android' | 'web' | 'ext' | 'desktop'
  branch           TEXT,
  commit_sha       TEXT,
  app_version      TEXT,
  started_at       INTEGER NOT NULL, -- unix ms
  run_count        INTEGER,

  -- Core metrics (median across runs)
  start_ms         REAL,            -- tokensStartMs
  span_ms          REAL,            -- tokensSpanMs
  fc_count         REAL,            -- functionCallCount

  -- Thresholds at time of run
  start_threshold  REAL,
  span_threshold   REAL,
  fc_threshold     REAL,

  -- Regression result
  status           TEXT DEFAULT 'ok',  -- 'ok' | 'regression' | 'failed' | 'recovered'
  severity         TEXT DEFAULT 'INFO', -- 'P1' | 'P2' | 'INFO'
  regression       INTEGER DEFAULT 0,   -- 1 = triggered

  -- Delta vs baseline (%)
  delta_pct_start  REAL,
  delta_pct_span   REAL,

  created_at       INTEGER DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_jobs_platform_time
  ON perf_jobs (platform, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_branch_time
  ON perf_jobs (branch, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_commit
  ON perf_jobs (commit_sha);

-- ── Run level (typically 3 rows per job) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS perf_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES perf_jobs(job_id) ON DELETE CASCADE,
  session_id  TEXT,
  run_index   INTEGER,
  start_ms    REAL,
  span_ms     REAL,
  fc_count    REAL,
  UNIQUE (job_id, run_index)
);

CREATE INDEX IF NOT EXISTS idx_runs_job ON perf_runs (job_id);
CREATE INDEX IF NOT EXISTS idx_runs_session ON perf_runs (session_id);

-- ── Function hotspots (top-20 per session) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS perf_fn_stats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES perf_jobs(job_id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  platform    TEXT,

  fn_name     TEXT NOT NULL,
  fn_file     TEXT,
  fn_module   TEXT,

  call_count  INTEGER,
  total_ms    REAL,
  max_ms      REAL,
  avg_ms      REAL,
  p95_ms      REAL
);

CREATE INDEX IF NOT EXISTS idx_fn_job      ON perf_fn_stats (job_id);
CREATE INDEX IF NOT EXISTS idx_fn_platform ON perf_fn_stats (platform, job_id);
CREATE INDEX IF NOT EXISTS idx_fn_name     ON perf_fn_stats (fn_name, platform);

-- ── Key timing marks (all marks, per session) ──────────────────────────────
CREATE TABLE IF NOT EXISTS perf_marks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id         TEXT NOT NULL REFERENCES perf_jobs(job_id) ON DELETE CASCADE,
  session_id     TEXT NOT NULL,

  mark_name      TEXT NOT NULL,
  since_start_ms REAL,    -- ms since session start (null if not computable)
  ts             INTEGER, -- absolute timestamp ms
  absolute_time  INTEGER  -- absoluteTime from the event (may differ from ts)
);

CREATE INDEX IF NOT EXISTS idx_marks_job     ON perf_marks (job_id);
CREATE INDEX IF NOT EXISTS idx_marks_session ON perf_marks (session_id);
CREATE INDEX IF NOT EXISTS idx_marks_name    ON perf_marks (mark_name, job_id);
