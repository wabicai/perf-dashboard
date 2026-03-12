export type Platform = 'ios' | 'android' | 'web' | 'ext' | 'desktop' | string;
export type Status = 'ok' | 'regression' | 'failed' | 'recovered';
export type Severity = 'P1' | 'P2' | 'INFO';

export interface PerfJob {
  job_id: string;
  platform: Platform;
  branch: string | null;
  commit_sha: string | null;
  app_version: string | null;
  started_at: number;
  run_count: number | null;
  start_ms: number | null;
  span_ms: number | null;
  fc_count: number | null;
  start_threshold: number | null;
  span_threshold: number | null;
  fc_threshold: number | null;
  status: Status;
  severity: Severity;
  regression: 0 | 1;
  delta_pct_start: number | null;
  delta_pct_span: number | null;
  created_at?: number;
}

export interface PerfFnStat {
  fn_name: string;
  fn_file: string | null;
  fn_module: string | null;
  session_count: number;
  avg_call_count: number | null;
  avg_p95_ms: number | null;
  max_p95_ms: number | null;
  avg_avg_ms: number | null;
  avg_total_ms: number | null;
}

export interface CompareRow {
  platform: Platform;
  day: string;
  job_count: number;
  avg_start_ms: number | null;
  avg_span_ms: number | null;
  avg_fc_count: number | null;
  regression_count: number;
}

export type NavTab = 'trend' | 'compare' | 'functions' | 'regressions';
