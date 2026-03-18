import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { api } from '../api';
import { Select } from './ui/Select';
import { ErrorBanner } from './ui/ErrorBanner';
import { ChartSkeleton } from './ui/Skeleton';
import { platformLabel } from '../constants';
import type { CompareRow, PerfJob, JobDetailResponse } from '../types';

const METRICS = [
  { key: 'avg_start_ms', label: '启动延迟' },
  { key: 'avg_span_ms', label: '刷新耗时' },
  { key: 'avg_fc_count', label: '函数调用次数' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];
type CompareMode = 'date' | 'job';

interface Props {
  platforms: string[];
  onJobClick?: (jobId: string) => void;
}

function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export function ComparePanel({ platforms, onJobClick }: Props) {
  const today = new Date();
  const [mode, setMode] = useState<CompareMode>('date');
  const [dateA, setDateA] = useState(toDateStr(subDays(today, 1)));
  const [dateB, setDateB] = useState(toDateStr(today));
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [metric, setMetric] = useState<MetricKey>('avg_start_ms');
  const [dataA, setDataA] = useState<CompareRow[]>([]);
  const [dataB, setDataB] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Job mode state
  const [recentJobs, setRecentJobs] = useState<PerfJob[]>([]);
  const [jobIdA, setJobIdA] = useState<string>('');
  const [jobIdB, setJobIdB] = useState<string>('');
  const [jobDetailA, setJobDetailA] = useState<JobDetailResponse | null>(null);
  const [jobDetailB, setJobDetailB] = useState<JobDetailResponse | null>(null);
  const [jobLoading, setJobLoading] = useState(false);

  // Fetch recent jobs for job mode dropdowns
  useEffect(() => {
    api.trend(undefined, 14).then((jobs) => {
      setRecentJobs(jobs);
      if (jobs.length >= 2) {
        setJobIdA(jobs[jobs.length - 2].job_id);
        setJobIdB(jobs[jobs.length - 1].job_id);
      }
    }).catch(() => {});
  }, []);

  // Date mode fetch
  useEffect(() => {
    if (mode !== 'date') return;
    setLoading(true);
    setError(null);
    const p = selectedPlatform === 'all' ? undefined : selectedPlatform;
    Promise.all([
      api.compare(dateA, dateA, p),
      api.compare(dateB, dateB, p),
    ])
      .then(([a, b]) => { setDataA(a); setDataB(b); })
      .catch((e) => setError(String(e?.message || '加载对比数据失败')))
      .finally(() => setLoading(false));
  }, [dateA, dateB, selectedPlatform, mode]);

  // Job mode fetch
  useEffect(() => {
    if (mode !== 'job' || !jobIdA || !jobIdB) return;
    setJobLoading(true);
    setError(null);
    Promise.all([
      api.jobDetail(jobIdA),
      api.jobDetail(jobIdB),
    ])
      .then(([a, b]) => { setJobDetailA(a); setJobDetailB(b); })
      .catch((e) => setError(String(e?.message || '加载任务详情失败')))
      .finally(() => setJobLoading(false));
  }, [jobIdA, jobIdB, mode]);

  const platformsToShow =
    selectedPlatform === 'all' ? platforms : [selectedPlatform];

  const chartData = platformsToShow.map((p) => {
    const rowA = dataA.find((r) => r.platform === p);
    const rowB = dataB.find((r) => r.platform === p);
    return {
      platform: p,
      platformLabel: platformLabel(p),
      [dateA]: rowA?.[metric] ?? null,
      [dateB]: rowB?.[metric] ?? null,
    };
  }).filter((r) => r[dateA] != null || r[dateB] != null);

  // Compute average threshold for the selected metric
  const thresholdKey = metric === 'avg_start_ms' ? 'avg_start_threshold'
    : metric === 'avg_span_ms' ? 'avg_span_threshold'
    : 'avg_fc_threshold';
  const thresholdVals = [...dataA, ...dataB]
    .map((r) => r[thresholdKey])
    .filter((v): v is number => v != null && Number.isFinite(v));
  const avgThreshold = thresholdVals.length > 0
    ? thresholdVals.reduce((a, b) => a + b, 0) / thresholdVals.length
    : null;

  const delta = (a: number | null, b: number | null) => {
    if (a == null || b == null || a === 0) return null;
    return (((b - a) / a) * 100).toFixed(1);
  };

  // Job mode delta helper
  const jobDelta = (a: number | null, b: number | null) => {
    if (a == null || b == null || a === 0) return null;
    return (((b - a) / a) * 100).toFixed(1);
  };

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 bg-perf-surface/50 rounded-lg p-1 w-fit">
        {(['date', 'job'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-[13px] font-medium rounded-md border-none cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 ${
              mode === m
                ? 'bg-perf-surface text-perf-text'
                : 'bg-transparent text-perf-muted hover:text-perf-text-dim'
            }`}
          >
            {m === 'date' ? '按日期' : '按任务'}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        {mode === 'date' ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-perf-muted uppercase tracking-wider">日期 A</span>
              <input
                type="date"
                value={dateA}
                onChange={(e) => setDateA(e.target.value)}
                className="bg-perf-surface border border-perf-border rounded-lg text-perf-text px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 focus-visible:border-perf-accent/60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-perf-muted uppercase tracking-wider">日期 B</span>
              <input
                type="date"
                value={dateB}
                onChange={(e) => setDateB(e.target.value)}
                className="bg-perf-surface border border-perf-border rounded-lg text-perf-text px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 focus-visible:border-perf-accent/60"
              />
            </label>
            <Select
              label="平台"
              value={selectedPlatform}
              onChange={setSelectedPlatform}
              options={[{ value: 'all', label: '全部平台' }, ...platforms.map((p) => ({ value: p, label: platformLabel(p) }))]}
            />
            <Select
              label="指标"
              value={metric}
              onChange={(v) => setMetric(v as MetricKey)}
              options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
            />
          </>
        ) : (
          <>
            <Select
              label="任务 A"
              value={jobIdA}
              onChange={setJobIdA}
              options={recentJobs.map((j) => ({
                value: j.job_id,
                label: `${platformLabel(j.platform)} ${format(new Date(j.started_at), 'MM/dd HH:mm')} ${j.commit_sha?.slice(0, 7) || ''}`,
              }))}
            />
            <Select
              label="任务 B"
              value={jobIdB}
              onChange={setJobIdB}
              options={recentJobs.map((j) => ({
                value: j.job_id,
                label: `${platformLabel(j.platform)} ${format(new Date(j.started_at), 'MM/dd HH:mm')} ${j.commit_sha?.slice(0, 7) || ''}`,
              }))}
            />
          </>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {mode === 'date' && (
        <>
          {loading ? <ChartSkeleton /> : (
            <div className="bg-perf-card border border-perf-surface rounded-lg p-4">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-perf-surface)" />
                  <XAxis dataKey="platformLabel" tick={{ fill: 'var(--color-perf-text-dim)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--color-perf-text-dim)', fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{
                      background: 'var(--color-perf-surface)',
                      border: '1px solid var(--color-perf-border)',
                      borderRadius: 8,
                    }}
                    itemStyle={{ fontSize: 12 }}
                    formatter={(v: number) => `${Math.round(v)}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-perf-text-dim)' }} />
                  <Bar dataKey={dateA} name={`${dateA} (A)`} fill="#60a5fa" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={dateB} name={`${dateB} (B)`} fill="#34d399" radius={[4, 4, 0, 0]} />
                  {avgThreshold != null && metric !== 'avg_fc_count' && (
                    <ReferenceLine
                      y={avgThreshold}
                      stroke="var(--color-status-regression)"
                      strokeDasharray="6 3"
                      label={{ value: '阈值', fill: 'var(--color-status-regression)', fontSize: 11, position: 'insideTopRight' }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Delta table */}
          {chartData.length > 0 && (
            <div className="mt-5 rounded-lg overflow-hidden border border-perf-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {['平台', `${dateA} (A)`, `${dateB} (B)`, 'Δ %'].map((h) => (
                      <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row) => {
                    const a = row[dateA] as number | null;
                    const b = row[dateB] as number | null;
                    const d = delta(a, b);
                    const isWorse = d != null && parseFloat(d) > 5;
                    const isBetter = d != null && parseFloat(d) < -5;
                    return (
                      <tr key={row.platform} className="hover:bg-perf-hover transition-colors">
                        <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text">{platformLabel(row.platform)}</td>
                        <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text">{a != null ? Math.round(a) : '–'}</td>
                        <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text">{b != null ? Math.round(b) : '–'}</td>
                        <td className={`px-3 py-2 border-t border-perf-surface/50 font-semibold ${isWorse ? 'text-status-regression' : isBetter ? 'text-status-ok' : 'text-perf-text-dim'}`}>
                          {d != null ? `${parseFloat(d) > 0 ? '+' : ''}${d}%` : '–'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Job mode side-by-side */}
      {mode === 'job' && (
        <>
          {jobLoading ? <ChartSkeleton /> : (
            jobDetailA && jobDetailB && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[jobDetailA, jobDetailB].map((detail, idx) => (
                    <div key={idx} className="bg-perf-card border border-perf-surface rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold">{platformLabel(detail.job.platform)}</span>
                        <span className="text-xs text-perf-muted">
                          {format(new Date(detail.job.started_at), 'yyyy-MM-dd HH:mm')}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <MetricBox label="启动" value={detail.job.start_ms} unit="ms" />
                        <MetricBox label="刷新" value={detail.job.span_ms} unit="ms" />
                        <MetricBox label="函数调用" value={detail.job.fc_count} />
                      </div>
                      <div className="text-xs text-perf-muted">
                        {detail.runs.length} 轮运行, {detail.fn_stats.length} 个函数
                      </div>
                      {onJobClick && (
                        <button
                          onClick={() => onJobClick(detail.job.job_id)}
                          className="mt-2 text-xs text-perf-accent hover:underline bg-transparent border-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 rounded-md px-1"
                        >
                          查看详情 →
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Delta comparison table */}
                <div className="mt-5 rounded-lg overflow-hidden border border-perf-surface">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr>
                        {['指标', '任务 A', '任务 B', 'Δ %'].map((h) => (
                          <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { label: '启动', a: jobDetailA.job.start_ms, b: jobDetailB.job.start_ms, unit: 'ms' },
                        { label: '刷新', a: jobDetailA.job.span_ms, b: jobDetailB.job.span_ms, unit: 'ms' },
                        { label: '函数调用', a: jobDetailA.job.fc_count, b: jobDetailB.job.fc_count, unit: '' },
                      ] as const).map((row) => {
                        const d = jobDelta(row.a, row.b);
                        const isWorse = d != null && parseFloat(d) > 5;
                        const isBetter = d != null && parseFloat(d) < -5;
                        return (
                          <tr key={row.label} className="hover:bg-perf-hover transition-colors">
                            <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-medium">{row.label}</td>
                            <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                              {row.a != null ? `${Math.round(row.a)}${row.unit}` : '–'}
                            </td>
                            <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                              {row.b != null ? `${Math.round(row.b)}${row.unit}` : '–'}
                            </td>
                            <td className={`px-3 py-2 border-t border-perf-surface/50 font-semibold ${isWorse ? 'text-status-regression' : isBetter ? 'text-status-ok' : 'text-perf-text-dim'}`}>
                              {d != null ? `${parseFloat(d) > 0 ? '+' : ''}${d}%` : '–'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}

function MetricBox({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="bg-perf-row-alt rounded-lg px-2.5 py-2 text-center">
      <div className="text-[10px] text-perf-muted mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-perf-text">
        {value != null ? `${Math.round(value)}${unit || ''}` : '–'}
      </div>
    </div>
  );
}
