import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../api';
import { Select } from './ui/Select';
import { ErrorBanner } from './ui/ErrorBanner';
import { CardSkeleton } from './ui/Skeleton';
import { Chip } from './ui/Chip';
import { platformLabel, statusLabel } from '../constants';
import type { PerfJob } from '../types';

interface Props {
  platforms: string[];
  onJobClick?: (jobId: string) => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  P1: 'text-status-regression',
  P2: 'text-status-failed',
  INFO: 'text-status-info',
};

const SEVERITY_BORDER: Record<string, string> = {
  P1: 'border-l-status-regression',
  P2: 'border-l-status-failed',
  INFO: 'border-l-status-info',
};

const STATUS_ICON: Record<string, string> = {
  regression: '🔴',
  failed: '❌',
  recovered: '✅',
};

const PAGE_SIZE = 20;

type SeverityFilter = 'all' | 'P1' | 'P2+';

function fmt(v: number | null, unit = 'ms') {
  if (v == null) return '–';
  return `${Math.round(v)}${unit}`;
}

function fmtDelta(v: number | null) {
  if (v == null) return null;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export function RegressionTimeline({ platforms, onJobClick }: Props) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [days, setDays] = useState(30);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PerfJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const severityParam = severityFilter === 'all' ? undefined
      : severityFilter === 'P1' ? 'P1'
      : 'P2';

    api
      .regressions(
        selectedPlatform === 'all' ? undefined : selectedPlatform,
        days,
        severityParam,
        page,
        PAGE_SIZE,
      )
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
          setTotal(res.total);
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e?.message || '加载回归数据失败')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPlatform, days, severityFilter, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeData = data.filter((j) => j.status === 'regression' || j.status === 'failed');
  const recoveredData = data.filter((j) => j.status === 'recovered');

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <Select
          label="平台"
          value={selectedPlatform}
          onChange={(v) => { setSelectedPlatform(v); setPage(1); }}
          options={[{ value: 'all', label: '全部平台' }, ...platforms.map((p) => ({ value: p, label: platformLabel(p) }))]}
        />
        <Select
          label="时间范围"
          value={String(days)}
          onChange={(v) => { setDays(Number(v)); setPage(1); }}
          options={[
            { value: '7', label: '7 天' },
            { value: '14', label: '14 天' },
            { value: '30', label: '30 天' },
            { value: '60', label: '60 天' },
          ]}
        />

        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-perf-muted uppercase tracking-wider">严重程度</span>
          <div className="flex gap-0.5 bg-perf-surface/50 rounded-lg p-0.5">
            {(['all', 'P1', 'P2+'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setSeverityFilter(s); setPage(1); }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border-none cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 ${
                  severityFilter === s
                    ? 'bg-perf-surface text-perf-text'
                    : 'bg-transparent text-perf-muted hover:text-perf-text-dim'
                }`}
              >
                {s === 'all' ? '全部' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="text-status-ok text-center py-10 text-[15px]">
          ✅ 所选时间段内性能均正常
        </div>
      )}

      {/* Active regressions */}
      {!loading && activeData.length > 0 && (
        <>
          <div className="mb-2 text-[11px] text-status-regression font-semibold uppercase tracking-wider">
            🔴 性能仍超标 · 未恢复 ({activeData.length})
          </div>
          <div className="flex flex-col gap-2.5">
            {activeData.map((job) => (
              <RegressionCard key={job.job_id} job={job} onJobClick={onJobClick} />
            ))}
          </div>
        </>
      )}

      {/* Recovered */}
      {!loading && recoveredData.length > 0 && (
        <>
          <div className="mt-5 mb-2 text-[11px] text-status-ok font-semibold uppercase tracking-wider">
            ✅ 已恢复正常 ({recoveredData.length})
          </div>
          <div className="flex flex-col gap-2.5">
            {recoveredData.map((job) => (
              <RegressionCard key={job.job_id} job={job} onJobClick={onJobClick} />
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-perf-muted">
            第 {page} 页，共 {totalPages} 页（{total} 个回归）
          </span>
          <div className="flex gap-2">
            <PaginationButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              上一页
            </PaginationButton>
            <PaginationButton onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              下一页
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}

function RegressionCard({ job, onJobClick }: { job: PerfJob; onJobClick?: (id: string) => void }) {
  const sev = job.severity;
  const deltaStart = fmtDelta(job.delta_pct_start);
  const deltaSpan = fmtDelta(job.delta_pct_span);

  return (
    <div
      onClick={() => onJobClick?.(job.job_id)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onJobClick?.(job.job_id); }}
      className={`bg-perf-card border border-perf-surface border-l-[3px] ${SEVERITY_BORDER[sev] || 'border-l-perf-muted'} rounded-lg px-4 py-3 flex flex-col gap-2 cursor-pointer hover:bg-perf-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {STATUS_ICON[job.status] || '⚪'}{' '}
          <span className={SEVERITY_COLOR[sev] || 'text-perf-text'}>[{sev}]</span>{' '}
          {platformLabel(job.platform)}
          {' '}<span className="text-perf-muted font-normal text-xs">{statusLabel(job.status)}</span>
        </span>
        <span className="text-xs text-perf-muted">
          {format(new Date(job.started_at), 'yyyy-MM-dd HH:mm')}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {job.branch && <Chip>{job.branch}</Chip>}
        {job.commit_sha && <Chip mono>{job.commit_sha.slice(0, 7)}</Chip>}
        {job.app_version && <Chip>v{job.app_version}</Chip>}
      </div>

      <div className="flex flex-wrap gap-2">
        <MetricPill
          label="启动"
          value={fmt(job.start_ms)}
          threshold={fmt(job.start_threshold)}
          delta={deltaStart}
          bad={!!job.delta_pct_start && job.delta_pct_start > 0}
        />
        <MetricPill
          label="刷新"
          value={fmt(job.span_ms)}
          threshold={fmt(job.span_threshold)}
          delta={deltaSpan}
          bad={!!job.delta_pct_span && job.delta_pct_span > 0}
        />
        <MetricPill
          label="函数调用"
          value={job.fc_count != null ? String(Math.round(job.fc_count)) : '–'}
          threshold={null}
          delta={null}
          bad={false}
        />
      </div>
    </div>
  );
}

function MetricPill({
  label, value, threshold, delta, bad,
}: {
  label: string; value: string; threshold: string | null; delta: string | null; bad: boolean;
}) {
  return (
    <div className={`bg-perf-row-alt rounded-lg px-2.5 py-1.5 text-xs border ${bad ? 'border-err-border' : 'border-perf-surface'}`}>
      <div className="text-perf-muted text-[10px] mb-0.5">{label}</div>
      <span className={`font-semibold ${bad ? 'text-err-text' : 'text-perf-text'}`}>{value}</span>
      {threshold && <span className="text-perf-muted"> / {threshold}</span>}
      {delta && (
        <span className={`ml-1.5 text-[11px] ${bad ? 'text-status-regression' : 'text-status-ok'}`}>
          {delta}
        </span>
      )}
    </div>
  );
}

function PaginationButton({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 text-xs rounded-lg bg-perf-surface border border-perf-border text-perf-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:bg-perf-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50"
    >
      {children}
    </button>
  );
}
