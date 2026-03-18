import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../api';
import { ErrorBanner } from './ui/ErrorBanner';
import { Skeleton } from './ui/Skeleton';
import { Chip } from './ui/Chip';
import { platformLabel, statusLabel } from '../constants';
import type { JobDetailResponse, PerfRun, PerfMark, PerfFnStat } from '../types';

interface Props {
  jobId: string;
  onClose: () => void;
}

export function JobDetailModal({ jobId, onClose }: Props) {
  const [data, setData] = useState<JobDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.jobDetail(jobId)
      .then(setData)
      .catch((e) => setError(String(e?.message || '加载任务详情失败')))
      .finally(() => setLoading(false));
  }, [jobId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-12 px-4 overflow-y-auto animate-backdrop-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-perf-bg border border-perf-surface rounded-xl w-full max-w-[900px] mb-12 shadow-2xl animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-perf-surface">
          <div>
            <h2 className="text-lg font-bold text-perf-text m-0">任务详情</h2>
            <span className="text-xs text-perf-muted font-mono">{jobId}</span>
          </div>
          <button
            onClick={onClose}
            className="text-perf-muted hover:text-perf-text bg-transparent border-none cursor-pointer text-xl leading-none p-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {loading && (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
          {error && <ErrorBanner message={error} />}

          {data && (
            <div className="flex flex-col gap-6">
              {/* Job summary */}
              <JobSummary job={data.job} />

              {/* Top slow functions — most actionable info first */}
              {data.fn_stats.length > 0 && <SlowFunctions fnStats={data.fn_stats} />}

              {/* Marks timeline */}
              <MarksTimeline marks={data.marks} />

              {/* Per-run raw data — detail last */}
              {data.runs.length > 0 && <RunsTable runs={data.runs} job={data.job} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobSummary({ job }: { job: JobDetailResponse['job'] }) {
  return (
    <div className="bg-perf-card border border-perf-surface rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm font-semibold">{platformLabel(job.platform)}</span>
        <span className={`text-[11px] font-semibold rounded-md px-1.5 py-0.5 ${
          job.status === 'ok' ? 'text-status-ok bg-status-ok/10' :
          job.status === 'regression' ? 'text-status-regression bg-status-regression/10' :
          'text-status-failed bg-status-failed/10'
        }`}>
          {statusLabel(job.status)}
        </span>
        <span className="text-xs text-perf-muted">
          {format(new Date(job.started_at), 'yyyy-MM-dd HH:mm:ss')}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {job.branch && <Chip>{job.branch}</Chip>}
        {job.commit_sha && <Chip mono>{job.commit_sha.slice(0, 7)}</Chip>}
        {job.app_version && <Chip>v{job.app_version}</Chip>}
        {job.run_count != null && <Chip>{job.run_count} 轮</Chip>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="启动" value={job.start_ms} unit="ms" threshold={job.start_threshold} delta={job.delta_pct_start} />
        <MetricCard label="刷新" value={job.span_ms} unit="ms" threshold={job.span_threshold} delta={job.delta_pct_span} />
        <MetricCard label="函数调用" value={job.fc_count} threshold={job.fc_threshold} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, unit, threshold, delta }: {
  label: string; value: number | null; unit?: string; threshold?: number | null; delta?: number | null;
}) {
  const bad = delta != null && delta > 0;
  return (
    <div className={`bg-perf-row-alt rounded-lg p-3 border ${bad ? 'border-err-border' : 'border-perf-surface'}`}>
      <div className="text-[10px] text-perf-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold text-perf-text">
        {value != null ? `${Math.round(value)}${unit || ''}` : '–'}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {threshold != null && (
          <span className="text-[11px] text-perf-muted">阈值: {Math.round(threshold)}{unit || ''}</span>
        )}
        {delta != null && (
          <span className={`text-[11px] font-semibold ${bad ? 'text-status-regression' : 'text-status-ok'}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function RunsTable({ runs, job }: { runs: PerfRun[]; job: JobDetailResponse['job'] }) {
  // Find median run (by start_ms)
  const sortedByStart = [...runs].filter((r) => r.start_ms != null).sort((a, b) => a.start_ms! - b.start_ms!);
  const medianIdx = Math.floor(sortedByStart.length / 2);
  const medianSessionId = sortedByStart[medianIdx]?.session_id;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-sm font-semibold text-perf-text">各轮测试数据</h3>
        <span className="text-xs text-perf-muted">共 {runs.length} 轮，高亮行为中位数</span>
      </div>
      <div className="rounded-lg overflow-hidden border border-perf-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['轮次', '启动 ms', '刷新 ms', '函数调用'].map((h) => (
                <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const isMedian = run.session_id === medianSessionId;
              const startExceeds = job.start_threshold != null && run.start_ms != null && run.start_ms > job.start_threshold;
              const spanExceeds = job.span_threshold != null && run.span_ms != null && run.span_ms > job.span_threshold;
              return (
                <tr key={i} className={`hover:bg-perf-hover transition-colors ${isMedian ? 'bg-perf-accent/5' : i % 2 !== 0 ? 'bg-perf-row-alt' : ''}`}>
                  <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text">
                    #{run.run_index ?? i + 1}
                    {isMedian && <span className="ml-1.5 text-[10px] text-perf-accent font-medium">中位数</span>}
                  </td>
                  <td className={`px-3 py-2 border-t border-perf-surface/50 font-mono ${startExceeds ? 'text-err-text font-semibold' : 'text-perf-text'}`}>
                    {run.start_ms != null ? `${Math.round(run.start_ms)}ms` : '–'}
                  </td>
                  <td className={`px-3 py-2 border-t border-perf-surface/50 font-mono ${spanExceeds ? 'text-err-text font-semibold' : 'text-perf-text'}`}>
                    {run.span_ms != null ? `${Math.round(run.span_ms)}ms` : '–'}
                  </td>
                  <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                    {run.fc_count != null ? run.fc_count : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarksTimeline({ marks }: { marks: PerfMark[] }) {
  // Use since_start_ms if available; fallback to relative offset from first ts
  const firstTs = marks.find((m) => m.ts != null)?.ts ?? null;
  const enriched = marks.map((m) => ({
    ...m,
    sinceMs: m.since_start_ms ?? (m.ts != null && firstTs != null ? m.ts - firstTs : null),
  }));
  const valid = enriched.filter((m) => m.sinceMs != null).sort((a, b) => a.sinceMs! - b.sinceMs!);

  return (
    <div>
      <h3 className="text-sm font-semibold text-perf-text mb-3">关键标记时间线</h3>
      <div className="bg-perf-card border border-perf-surface rounded-lg p-4">
        {valid.length === 0 ? (
          <p className="text-perf-muted text-xs">暂无标记数据</p>
        ) : (
          <div className="flex flex-col gap-0 max-h-[240px] overflow-y-auto">
            {valid.map((mark, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-perf-surface/40 last:border-0">
                <span className="text-[11px] font-mono text-perf-muted w-16 shrink-0 text-right">
                  {Math.round(mark.sinceMs!)}ms
                </span>
                <span className="w-2 h-2 rounded-full bg-perf-accent shrink-0" />
                <span className="text-[12px] text-perf-text font-medium">{mark.mark_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SlowFunctions({ fnStats }: { fnStats: PerfFnStat[] }) {
  const top10 = fnStats.slice(0, 10);

  return (
    <div>
      <h3 className="text-sm font-semibold text-perf-text mb-3">最慢函数 TOP 10</h3>
      <div className="rounded-lg overflow-hidden border border-perf-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['函数', '模块', 'p95 ms', '平均 ms', '调用次数'].map((h) => (
                <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top10.map((fn, i) => (
              <tr key={i} className={`hover:bg-perf-hover transition-colors ${i % 2 !== 0 ? 'bg-perf-row-alt' : ''}`}>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono text-xs max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap" title={fn.fn_name}>
                  {fn.fn_name}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text-dim text-xs">
                  {fn.fn_module ?? '–'}
                </td>
                <td className={`px-3 py-2 border-t border-perf-surface/50 font-mono ${fn.avg_p95_ms != null && fn.avg_p95_ms > 100 ? 'text-err-text font-semibold' : 'text-perf-text'}`}>
                  {fn.avg_p95_ms != null ? `${fn.avg_p95_ms.toFixed(1)}ms` : '–'}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                  {fn.avg_avg_ms != null ? `${fn.avg_avg_ms.toFixed(1)}ms` : '–'}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                  {fn.avg_call_count != null ? fn.avg_call_count.toFixed(0) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
