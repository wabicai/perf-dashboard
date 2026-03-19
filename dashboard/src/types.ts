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

export interface PerfRun {
  job_id: string;
  session_id: string | null;
  run_index: number | null;
  start_ms: number | null;
  span_ms: number | null;
  fc_count: number | null;
}

export interface PerfMark {
  job_id: string;
  session_id: string;
  mark_name: string;
  since_start_ms: number | null;
  ts: number | null;
  absolute_time: string | null;
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
  delta_avg_p95_ms?: number | null;
}

export interface CompareRow {
  platform: Platform;
  day: string;
  job_count: number;
  avg_start_ms: number | null;
  avg_span_ms: number | null;
  avg_fc_count: number | null;
  regression_count: number;
  avg_start_threshold: number | null;
  avg_span_threshold: number | null;
  avg_fc_threshold: number | null;
}

export interface InsightFunction {
  name: string;
  module: string | null;
  p95: number | null;
  avg: number | null;
  count: number | null;
}

export interface RepeatedCall {
  name: string;
  file: string | null;
  module: string | null;
  calls: number | null;
  total_duration_ms: number | null;
}

export interface JsBlockWindow {
  span: number | null;
  jsblock: { name: string; duration: number } | null;
  topFunctions: InsightFunction[];
}

export interface HomeRefreshInsight {
  startSinceSessionStartMs: number | null;
  endSinceSessionStartMs: number | null;
  spanMs: number | null;
  topFunctions: InsightFunction[];
}

export interface SessionInsights {
  repeated_calls: RepeatedCall[];
  jsblock: { minDriftMs: number | null; topWindows: JsBlockWindow[] } | null;
  low_fps: { thresholdFps: number | null; topWindows: { span: number | null; fps: { min: number; avg: number } | null; topFunctions: InsightFunction[] }[] } | null;
  home_refresh: HomeRefreshInsight | null;
  key_marks: { sessionStart: number; marks: Record<string, number | null> } | null;
}

export interface JobDetailResponse {
  job: PerfJob;
  runs: PerfRun[];
  fn_stats: PerfFnStat[];
  marks: PerfMark[];
  insights: SessionInsights | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface VersionSummary {
  app_version: string;
  platform: Platform;
  job_count: number;
  first_seen: number;
  last_seen: number;
  avg_start_ms: number | null;
  avg_span_ms: number | null;
  avg_fc_count: number | null;
  avg_start_threshold: number | null;
  avg_span_threshold: number | null;
  regression_count: number;
}

export type NavTab = 'trend' | 'compare' | 'functions' | 'regressions';
