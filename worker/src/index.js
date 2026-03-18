/**
 * Perf Analytics Cloudflare Worker
 *
 * Endpoints:
 *   POST /ingest/job          – job-level report (from notify.js)
 *   POST /ingest/session      – session-level derived + marks (from run scripts)
 *   GET  /api/platforms       – distinct platforms
 *   GET  /api/trend           – time-series per platform
 *   GET  /api/compare         – compare two date ranges
 *   GET  /api/functions       – top slow functions (paginated, with delta)
 *   GET  /api/regressions     – regression events (paginated, severity filter)
 *   GET  /api/summary         – latest job per platform
 *   GET  /api/marks           – marks for a session/job
 *   GET  /api/job/:job_id     – full job detail (runs, fn_stats, marks)
 *
 * Environment bindings (set in wrangler.toml / dashboard secrets):
 *   DB               – D1 database binding
 *   PERF_SECRET      – shared secret (optional; checked via x-perf-secret header)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-perf-secret',
};

// ---------------------------------------------------------------------------
// Router helpers
// ---------------------------------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

function checkAuth(request, env) {
  const secret = env.PERF_SECRET;
  if (!secret) return true; // no secret configured → open
  return request.headers.get('x-perf-secret') === secret;
}

// ---------------------------------------------------------------------------
// Ingest handlers
// ---------------------------------------------------------------------------

async function handleIngestJob(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.job_id || !body.platform) {
    return err('Missing required fields: job_id, platform');
  }

  const db = env.DB;

  // Upsert job row
  await db
    .prepare(
      `INSERT OR REPLACE INTO perf_jobs
         (job_id, platform, branch, commit_sha, app_version, started_at,
          run_count, start_ms, span_ms, fc_count,
          start_threshold, span_threshold, fc_threshold,
          status, severity, regression, delta_pct_start, delta_pct_span)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      body.job_id,
      body.platform,
      body.branch ?? null,
      body.commit_sha ?? null,
      body.app_version ?? null,
      body.started_at,
      body.run_count ?? null,
      body.start_ms ?? null,
      body.span_ms ?? null,
      body.fc_count ?? null,
      body.start_threshold ?? null,
      body.span_threshold ?? null,
      body.fc_threshold ?? null,
      body.status ?? 'ok',
      body.severity ?? 'INFO',
      body.regression ?? 0,
      body.delta_pct_start ?? null,
      body.delta_pct_span ?? null,
    )
    .run();

  // Upsert individual runs
  if (Array.isArray(body.runs) && body.runs.length > 0) {
    const runStmts = body.runs.map((r) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO perf_runs
             (job_id, session_id, run_index, start_ms, span_ms, fc_count)
           VALUES (?,?,?,?,?,?)`,
        )
        .bind(
          body.job_id,
          r.session_id ?? null,
          r.run_index ?? null,
          r.start_ms ?? null,
          r.span_ms ?? null,
          r.fc_count ?? null,
        ),
    );
    await db.batch(runStmts);
  }

  return json({ ok: true, job_id: body.job_id });
}

async function handleIngestSession(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.job_id || !body.session_id) {
    return err('Missing required fields: job_id, session_id');
  }

  const db = env.DB;
  const stmts = [];

  // Delete then re-insert fn_stats for this session (idempotent)
  stmts.push(
    db
      .prepare(`DELETE FROM perf_fn_stats WHERE session_id = ?`)
      .bind(body.session_id),
  );

  if (Array.isArray(body.slow_functions) && body.slow_functions.length > 0) {
    for (const f of body.slow_functions.slice(0, 20)) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO perf_fn_stats
               (job_id, session_id, platform, fn_name, fn_file, fn_module,
                call_count, total_ms, max_ms, avg_ms, p95_ms)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            body.job_id,
            body.session_id,
            body.platform ?? null,
            f.fn_name,
            f.fn_file ?? null,
            f.fn_module ?? null,
            f.call_count ?? null,
            f.total_ms ?? null,
            f.max_ms ?? null,
            f.avg_ms ?? null,
            f.p95_ms ?? null,
          ),
      );
    }
  }

  // Delete then re-insert marks for this session (idempotent)
  stmts.push(
    db
      .prepare(`DELETE FROM perf_marks WHERE session_id = ?`)
      .bind(body.session_id),
  );

  if (Array.isArray(body.marks) && body.marks.length > 0) {
    for (const m of body.marks) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO perf_marks
               (job_id, session_id, mark_name, since_start_ms, ts, absolute_time)
             VALUES (?,?,?,?,?,?)`,
          )
          .bind(
            body.job_id,
            body.session_id,
            m.name,
            m.sinceSessionStartMs ?? null,
            m.ts ?? null,
            m.absoluteTime ?? null,
          ),
      );
    }
  }

  // D1 batch limit is 100 statements; chunk if needed
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }

  return json({ ok: true, session_id: body.session_id });
}

// ---------------------------------------------------------------------------
// Query handlers
// ---------------------------------------------------------------------------

async function handlePlatforms(env) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT platform FROM perf_jobs ORDER BY platform`,
  ).all();
  return json(results.map((r) => r.platform));
}

async function handleSummary(env) {
  const { results } = await env.DB.prepare(
    `WITH latest AS (
       SELECT platform, MAX(started_at) AS max_at
       FROM perf_jobs GROUP BY platform
     ),
     latest_jobs AS (
       SELECT j.platform, MAX(j.job_id) AS max_job_id
       FROM perf_jobs j
       JOIN latest ON j.platform = latest.platform AND j.started_at = latest.max_at
       GROUP BY j.platform
     )
     SELECT j.*
     FROM perf_jobs j
     JOIN latest_jobs ON j.job_id = latest_jobs.max_job_id
     ORDER BY j.platform`,
  ).all();
  return json(results);
}

async function handleTrend(request, env) {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') || null;
  const days = Math.min(Number(url.searchParams.get('days') || 30), 90);
  const since = Date.now() - days * 86400_000;

  let query = `
    SELECT job_id, platform, branch, commit_sha, app_version,
           started_at, status, severity, regression,
           start_ms, span_ms, fc_count,
           start_threshold, span_threshold,
           delta_pct_start, delta_pct_span
    FROM perf_jobs
    WHERE started_at >= ?`;
  const binds = [since];

  if (platform) {
    query += ` AND platform = ?`;
    binds.push(platform);
  }
  query += ` ORDER BY started_at ASC`;

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return json(results);
}

async function handleCompare(request, env) {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') || null;
  const from = url.searchParams.get('from'); // YYYY-MM-DD
  const to = url.searchParams.get('to');     // YYYY-MM-DD

  if (!from || !to) return err('Required: from, to (YYYY-MM-DD)');

  const fromTs = new Date(from).getTime();
  const toEnd = new Date(to).getTime() + 86400_000; // inclusive day

  let query = `
    SELECT platform,
           date(started_at / 1000, 'unixepoch') AS day,
           COUNT(*) AS job_count,
           AVG(start_ms) AS avg_start_ms,
           AVG(span_ms)  AS avg_span_ms,
           AVG(fc_count) AS avg_fc_count,
           SUM(CASE WHEN regression = 1 THEN 1 ELSE 0 END) AS regression_count,
           AVG(start_threshold) AS avg_start_threshold,
           AVG(span_threshold)  AS avg_span_threshold,
           AVG(fc_threshold)    AS avg_fc_threshold
    FROM perf_jobs
    WHERE started_at >= ? AND started_at < ?`;
  const binds = [fromTs, toEnd];

  if (platform) {
    query += ` AND platform = ?`;
    binds.push(platform);
  }
  query += ` GROUP BY platform, day ORDER BY platform, day`;

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return json(results);
}

async function handleFunctions(request, env) {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') || null;
  const days = Math.min(Number(url.searchParams.get('days') || 7), 30);
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
  const compare = url.searchParams.get('compare'); // 'previous'
  const since = Date.now() - days * 86400_000;
  const offset = (page - 1) * limit;

  // Count total
  let countQuery = `
    SELECT COUNT(DISTINCT f.fn_name || COALESCE(f.fn_file, '') || COALESCE(f.fn_module, '')) AS total
    FROM perf_fn_stats f
    JOIN perf_jobs j ON f.job_id = j.job_id
    WHERE j.started_at >= ?`;
  const countBinds = [since];

  if (platform) {
    countQuery += ` AND j.platform = ?`;
    countBinds.push(platform);
  }

  const countResult = await env.DB.prepare(countQuery).bind(...countBinds).first();
  const total = countResult?.total ?? 0;

  // Main query
  let query = `
    SELECT f.fn_name, f.fn_file, f.fn_module,
           COUNT(DISTINCT f.session_id)          AS session_count,
           ROUND(AVG(f.call_count), 1)           AS avg_call_count,
           ROUND(AVG(f.p95_ms), 2)               AS avg_p95_ms,
           ROUND(MAX(f.p95_ms), 2)               AS max_p95_ms,
           ROUND(AVG(f.avg_ms), 2)               AS avg_avg_ms,
           ROUND(AVG(f.total_ms), 2)             AS avg_total_ms
    FROM perf_fn_stats f
    JOIN perf_jobs j ON f.job_id = j.job_id
    WHERE j.started_at >= ?`;
  const binds = [since];

  if (platform) {
    query += ` AND j.platform = ?`;
    binds.push(platform);
  }
  query += `
    GROUP BY f.fn_name, f.fn_file, f.fn_module
    ORDER BY avg_p95_ms DESC
    LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...binds).all();

  // If compare=previous, fetch previous period for delta
  if (compare === 'previous' && results.length > 0) {
    const prevSince = since - days * 86400_000;
    const fnNames = results.map((r) => r.fn_name);

    let prevQuery = `
      SELECT f.fn_name, f.fn_file, f.fn_module,
             ROUND(AVG(f.p95_ms), 2) AS avg_p95_ms
      FROM perf_fn_stats f
      JOIN perf_jobs j ON f.job_id = j.job_id
      WHERE j.started_at >= ? AND j.started_at < ?`;
    const prevBinds = [prevSince, since];

    if (platform) {
      prevQuery += ` AND j.platform = ?`;
      prevBinds.push(platform);
    }

    // Filter by function names from current period
    const placeholders = fnNames.map(() => '?').join(',');
    prevQuery += ` AND f.fn_name IN (${placeholders})`;
    prevBinds.push(...fnNames);

    prevQuery += ` GROUP BY f.fn_name, f.fn_file, f.fn_module`;

    const { results: prevResults } = await env.DB.prepare(prevQuery).bind(...prevBinds).all();
    const prevMap = new Map(prevResults.map((r) => [r.fn_name, r.avg_p95_ms]));

    for (const row of results) {
      const prevP95 = prevMap.get(row.fn_name);
      row.delta_avg_p95_ms = prevP95 != null && row.avg_p95_ms != null
        ? Math.round((row.avg_p95_ms - prevP95) * 100) / 100
        : null;
    }
  }

  return json({ data: results, total, page, per_page: limit });
}

async function handleRegressions(request, env) {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') || null;
  const severity = url.searchParams.get('severity') || null;
  const days = Math.min(Number(url.searchParams.get('days') || 30), 90);
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
  const perPage = Math.min(Number(url.searchParams.get('per_page') || 20), 50);
  const since = Date.now() - days * 86400_000;
  const offset = (page - 1) * perPage;

  // Base WHERE clause
  let where = `WHERE started_at >= ? AND status IN ('regression', 'failed')`;
  const binds = [since];

  if (platform) {
    where += ` AND platform = ?`;
    binds.push(platform);
  }

  if (severity === 'P1') {
    where += ` AND severity = 'P1'`;
  } else if (severity === 'P2') {
    where += ` AND severity IN ('P1', 'P2')`;
  }

  // Count
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM perf_jobs ${where}`,
  ).bind(...binds).first();
  const total = countResult?.total ?? 0;

  // Data
  const { results } = await env.DB.prepare(
    `SELECT job_id, platform, branch, commit_sha, app_version,
            started_at, status, severity,
            start_ms, span_ms, fc_count,
            start_threshold, span_threshold,
            delta_pct_start, delta_pct_span
     FROM perf_jobs
     ${where}
     ORDER BY started_at DESC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, perPage, offset).all();

  return json({ data: results, total, page, per_page: perPage });
}

async function handleMarks(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  const jobId = url.searchParams.get('job_id');

  if (!sessionId && !jobId) return err('Required: session_id or job_id');

  let query = `SELECT * FROM perf_marks WHERE `;
  const binds = [];

  if (sessionId) {
    query += `session_id = ?`;
    binds.push(sessionId);
  } else {
    query += `job_id = ?`;
    binds.push(jobId);
  }
  query += ` ORDER BY ts ASC LIMIT 2000`;

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return json(results);
}

async function handleJobDetail(jobId, env) {
  // Batch query: job + runs + fn_stats + marks
  const [jobResult, runsResult, fnStatsResult, marksResult] = await Promise.all([
    env.DB.prepare(`SELECT * FROM perf_jobs WHERE job_id = ?`).bind(jobId).first(),
    env.DB.prepare(
      `SELECT job_id, session_id, run_index, start_ms, span_ms, fc_count
       FROM perf_runs WHERE job_id = ? ORDER BY run_index ASC`,
    ).bind(jobId).all(),
    env.DB.prepare(
      `SELECT fn_name, fn_file, fn_module,
              COUNT(DISTINCT session_id) AS session_count,
              ROUND(AVG(call_count), 1) AS avg_call_count,
              ROUND(AVG(p95_ms), 2) AS avg_p95_ms,
              ROUND(MAX(p95_ms), 2) AS max_p95_ms,
              ROUND(AVG(avg_ms), 2) AS avg_avg_ms,
              ROUND(AVG(total_ms), 2) AS avg_total_ms
       FROM perf_fn_stats
       WHERE job_id = ?
       GROUP BY fn_name, fn_file, fn_module
       ORDER BY avg_p95_ms DESC
       LIMIT 20`,
    ).bind(jobId).all(),
    env.DB.prepare(
      `SELECT * FROM perf_marks WHERE job_id = ? ORDER BY since_start_ms ASC LIMIT 500`,
    ).bind(jobId).all(),
  ]);

  if (!jobResult) return err('Job not found', 404);

  return json({
    job: jobResult,
    runs: runsResult.results,
    fn_stats: fnStatsResult.results,
    marks: marksResult.results,
  });
}

async function handleVersions(request, env) {
  const url = new URL(request.url);
  const platform = url.searchParams.get('platform') || null;
  const days = Math.min(Number(url.searchParams.get('days') || 90), 365);
  const since = Date.now() - days * 86400_000;

  let query = `
    SELECT app_version,
           platform,
           COUNT(*) AS job_count,
           MIN(started_at) AS first_seen,
           MAX(started_at) AS last_seen,
           ROUND(AVG(start_ms), 1)       AS avg_start_ms,
           ROUND(AVG(span_ms), 1)        AS avg_span_ms,
           ROUND(AVG(fc_count), 1)       AS avg_fc_count,
           ROUND(AVG(start_threshold), 1) AS avg_start_threshold,
           ROUND(AVG(span_threshold), 1)  AS avg_span_threshold,
           SUM(CASE WHEN regression = 1 THEN 1 ELSE 0 END) AS regression_count
    FROM perf_jobs
    WHERE started_at >= ? AND app_version IS NOT NULL`;
  const binds = [since];

  if (platform) {
    query += ` AND platform = ?`;
    binds.push(platform);
  }

  query += ` GROUP BY app_version, platform ORDER BY last_seen DESC`;

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return json(results);
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';

    // ── Ingest endpoints (POST, authenticated) ──────────────────────────────
    if (method === 'POST') {
      if (!checkAuth(request, env)) {
        return err('Unauthorized', 401);
      }
      if (path === '/ingest/job') return handleIngestJob(request, env);
      if (path === '/ingest/session') return handleIngestSession(request, env);
      return err('Not found', 404);
    }

    // ── Query endpoints (GET, public) ───────────────────────────────────────
    if (method === 'GET') {
      if (path === '/api/platforms')   return handlePlatforms(env);
      if (path === '/api/summary')     return handleSummary(env);
      if (path === '/api/trend')       return handleTrend(request, env);
      if (path === '/api/compare')     return handleCompare(request, env);
      if (path === '/api/functions')   return handleFunctions(request, env);
      if (path === '/api/regressions') return handleRegressions(request, env);
      if (path === '/api/versions')    return handleVersions(request, env);
      if (path === '/api/marks')       return handleMarks(request, env);

      // Job detail: /api/job/:job_id
      const jobMatch = path.match(/^\/api\/job\/(.+)$/);
      if (jobMatch) return handleJobDetail(decodeURIComponent(jobMatch[1]), env);

      if (path === '/api/health') {
        return json({ ok: true, ts: Date.now() });
      }
      return err('Not found', 404);
    }

    return err('Method not allowed', 405);
  },
};
