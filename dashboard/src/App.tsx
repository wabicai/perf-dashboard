import { useEffect, useState } from 'react';
import { api } from './api';
import { TrendChart } from './components/TrendChart';
import { ComparePanel } from './components/ComparePanel';
import { FunctionTable } from './components/FunctionTable';
import { HistoryTable } from './components/HistoryTable';
import { JobDetailModal } from './components/JobDetailModal';
import { ErrorBanner } from './components/ui/ErrorBanner';
import { Skeleton } from './components/ui/Skeleton';
import { platformLabel, statusLabel } from './constants';
import type { PerfJob, RecentJob } from './types';

type Tab = 'trend' | 'compare' | 'functions' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'trend', label: '趋势' },
  { id: 'compare', label: '对比' },
  { id: 'functions', label: '函数' },
  { id: 'history', label: '历史记录' },
];

const STATUS_COLOR: Record<string, string> = {
  ok: 'border-t-status-ok',
  regression: 'border-t-status-regression',
  failed: 'border-t-status-failed',
};

const STATUS_TEXT_COLOR: Record<string, string> = {
  ok: 'text-status-ok bg-status-ok/10',
  regression: 'text-status-regression bg-status-regression/10',
  failed: 'text-status-failed bg-status-failed/10',
};

function SummaryCard({ job, onClick }: { job: PerfJob; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-perf-card border border-perf-surface/30 ${STATUS_COLOR[job.status] || 'border-t-perf-muted'} border-t-2 rounded-lg px-4 py-3 min-w-[180px] flex-[1_1_180px] cursor-pointer hover:bg-perf-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(); }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-perf-muted uppercase tracking-wider">{platformLabel(job.platform)}</span>
        <span className="text-[10px] text-perf-text-faint">最新一次 CI</span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[22px] font-bold text-perf-text">
          {job.start_ms != null ? `${Math.round(job.start_ms)}ms` : '–'}
        </span>
        <span className="text-[11px] text-perf-muted">启动</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-base font-semibold text-perf-text-dim">
          {job.span_ms != null ? `${Math.round(job.span_ms)}ms` : '–'}
        </span>
        <span className="text-[11px] text-perf-muted">刷新</span>
      </div>
      <div className={`inline-block text-[11px] font-semibold rounded-md px-1.5 py-0.5 ${STATUS_TEXT_COLOR[job.status] || 'text-perf-muted bg-perf-muted/10'}`}>
        {statusLabel(job.status)}
      </div>
      {job.app_version && (
        <div className="text-[10px] text-perf-text-faint mt-1">{job.app_version}</div>
      )}
      {/* Recent job history dots */}
      {job.recentJobs && job.recentJobs.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-perf-muted mr-1">近 7 次</span>
            {job.recentJobs.map((j: RecentJob, idx: number) => (
              <div
                key={idx}
                title={`${j.job_id}: ${statusLabel(j.status)}`}
                className={`w-2 h-2 rounded-full cursor-default shrink-0 ${
                  j.status === 'ok' ? 'bg-status-ok' :
                  j.status === 'regression' ? 'bg-status-regression' :
                  'bg-status-failed'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-[10px] text-perf-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-status-ok inline-block shrink-0" />正常
            </span>
            <span className="flex items-center gap-1 text-[10px] text-perf-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-status-regression inline-block shrink-0" />超标
            </span>
            <span className="flex items-center gap-1 text-[10px] text-perf-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-status-failed inline-block shrink-0" />失败
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('trend');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [summary, setSummary] = useState<PerfJob[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('job_id'),
  );

  useEffect(() => {
    Promise.all([
      api.platforms().then(setPlatforms),
      api.summary().then(setSummary),
    ])
      .catch((e) => setInitError(String(e?.message || '无法连接分析服务')))
      .finally(() => setInitLoading(false));
  }, []);

  const handleJobClick = (jobId: string) => setSelectedJobId(jobId);

  // Keep URL in sync with selected job
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedJobId) {
      params.set('job_id', selectedJobId);
    } else {
      params.delete('job_id');
    }
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [selectedJobId]);

  return (
    <div className="min-h-screen bg-perf-bg text-perf-text">
      {/* Header */}
      <div className="border-b border-perf-surface px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3 pt-4">
            <span className="text-xl font-bold text-perf-text">性能看板</span>
            <span className="text-xs text-perf-text-faint bg-perf-surface rounded-md px-2 py-0.5">
              OneKey Performance Analytics
            </span>
          </div>

          {initError && <ErrorBanner message={initError} />}

          {/* Summary cards */}
          {initLoading ? (
            <div className="flex flex-wrap gap-2.5 py-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[120px] min-w-[180px] flex-[1_1_180px] rounded-lg" />
              ))}
            </div>
          ) : summary.length > 0 ? (
            <div className="flex flex-wrap gap-2.5 py-4">
              {summary.map((job) => (
                <SummaryCard
                  key={job.job_id}
                  job={job}
                  onClick={() => handleJobClick(job.job_id)}
                />
              ))}
            </div>
          ) : null}

          {/* Tabs */}
          <div className="flex mt-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`bg-transparent border-none cursor-pointer px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 focus-visible:rounded-t-md ${
                  tab === t.id
                    ? 'text-perf-accent border-b-perf-accent'
                    : 'text-perf-muted border-b-transparent hover:text-perf-text-dim'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1200px] mx-auto p-6">
        {tab === 'trend' && <TrendChart platforms={platforms} onJobClick={handleJobClick} />}
        {tab === 'compare' && <ComparePanel platforms={platforms} onJobClick={handleJobClick} />}
        {tab === 'functions' && <FunctionTable platforms={platforms} />}
        {tab === 'history' && <HistoryTable platforms={platforms} onJobClick={handleJobClick} />}
      </div>

      {/* Job Detail Modal */}
      {selectedJobId && (
        <JobDetailModal
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  );
}
