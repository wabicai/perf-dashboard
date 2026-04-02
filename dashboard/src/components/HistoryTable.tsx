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

const STATUS_DOT: Record<string, string> = {
  ok: 'bg-status-ok',
  regression: 'bg-status-regression',
  failed: 'bg-status-failed',
  recovered: 'bg-status-ok',
};

const PAGE_SIZE = 20;

export function HistoryTable({ platforms, onJobClick }: Props) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<PerfJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .trend(selectedPlatform === 'all' ? undefined : selectedPlatform, days)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message || '加载历史数据失败'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedPlatform, days]);

  // Sort by time descending (newest first)
  const sorted = [...data].sort((a, b) => b.started_at - a.started_at);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [selectedPlatform, days]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <Select
          label="平台"
          value={selectedPlatform}
          onChange={(v) => setSelectedPlatform(v)}
          options={[
            { value: 'all', label: '全部平台' },
            ...platforms.map((p) => ({ value: p, label: platformLabel(p) })),
          ]}
        />
        <Select
          label="时间范围"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[
            { value: '7', label: '7 天' },
            { value: '14', label: '14 天' },
            { value: '30', label: '30 天' },
            { value: '60', label: '60 天' },
            { value: '90', label: '90 天' },
          ]}
        />
      </div>

      {error && <ErrorBanner message={error} />}

      {loading && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {!loading && !error && sorted.length === 0 && (
        <div className="text-perf-muted text-center py-10 text-[15px]">
          所选时间段内暂无数据
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <>
          <div className="text-[11px] text-perf-muted mb-2">
            共 {sorted.length} 条记录
          </div>

          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[auto_1fr_100px_100px_80px_140px] gap-2 px-4 py-2 text-[11px] text-perf-muted uppercase tracking-wider border-b border-perf-surface">
            <span className="w-5" />
            <span>平台 / 分支</span>
            <span className="text-right">启动延迟</span>
            <span className="text-right">刷新耗时</span>
            <span className="text-center">状态</span>
            <span className="text-right">时间</span>
          </div>

          {/* Table rows */}
          {pageData.map((job) => (
            <div
              key={job.job_id}
              onClick={() => onJobClick?.(job.job_id)}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onJobClick?.(job.job_id); }}
              className="grid grid-cols-1 sm:grid-cols-[auto_1fr_100px_100px_80px_140px] gap-1 sm:gap-2 items-center px-4 py-2.5 border-b border-perf-surface/50 cursor-pointer hover:bg-perf-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50"
            >
              {/* Status dot */}
              <span className="hidden sm:flex justify-center">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[job.status] || 'bg-perf-muted'}`} />
              </span>

              {/* Platform + branch + version */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="sm:hidden">
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${STATUS_DOT[job.status] || 'bg-perf-muted'}`} />
                </span>
                <span className="text-sm font-medium text-perf-text truncate">
                  {platformLabel(job.platform)}
                </span>
                {job.branch && <Chip>{job.branch}</Chip>}
                {job.commit_sha && <Chip mono>{job.commit_sha.slice(0, 7)}</Chip>}
                {job.app_version && <Chip>v{job.app_version}</Chip>}
              </div>

              {/* Start ms */}
              <span className="text-right text-sm tabular-nums text-perf-text">
                {job.start_ms != null ? `${Math.round(job.start_ms)}ms` : '–'}
              </span>

              {/* Span ms */}
              <span className="text-right text-sm tabular-nums text-perf-text-dim">
                {job.span_ms != null ? `${Math.round(job.span_ms)}ms` : '–'}
              </span>

              {/* Status label */}
              <span className="text-center text-[11px] text-perf-muted">
                {statusLabel(job.status)}
              </span>

              {/* Time */}
              <span className="text-right text-xs text-perf-muted tabular-nums">
                {format(new Date(job.started_at), 'yyyy-MM-dd HH:mm')}
              </span>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-perf-muted">
                第 {page} 页，共 {totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-perf-surface border border-perf-border text-perf-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:bg-perf-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs rounded-lg bg-perf-surface border border-perf-border text-perf-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:bg-perf-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
