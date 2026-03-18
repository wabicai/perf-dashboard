import { useEffect, useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { api } from '../api';
import { Select } from './ui/Select';
import { ErrorBanner } from './ui/ErrorBanner';
import { ChartSkeleton } from './ui/Skeleton';
import { platformLabel } from '../constants';
import type { PerfJob, Platform } from '../types';

const PLATFORM_COLORS: Record<string, string> = {
  ios: '#60a5fa',
  android: '#34d399',
  web: '#f59e0b',
  ext: '#a78bfa',
  desktop: '#f472b6',
};

function getPlatformColor(p: string): string {
  if (PLATFORM_COLORS[p]) return PLATFORM_COLORS[p];
  const prefix = p.split('.')[0];
  return PLATFORM_COLORS[prefix] || 'var(--color-perf-text-dim)';
}

const METRICS = [
  { key: 'start_ms', label: '启动延迟', unit: 'ms' },
  { key: 'span_ms', label: '刷新耗时', unit: 'ms' },
  { key: 'fc_count', label: '函数调用次数', unit: '' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

interface Props {
  platforms: string[];
  onJobClick?: (jobId: string) => void;
}

export function TrendChart({ platforms, onJobClick }: Props) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [metric, setMetric] = useState<MetricKey>('start_ms');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<PerfJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .trend(selectedPlatform === 'all' ? undefined : selectedPlatform, days)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e?.message || '加载趋势数据失败')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPlatform, days]);

  const platformsToShow: Platform[] =
    selectedPlatform === 'all' ? platforms : [selectedPlatform];

  // Build ts→job_id lookup
  const tsToJobId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const job of data) {
      map[String(job.started_at)] = job.job_id;
    }
    return map;
  }, [data]);

  const chartData = data.map((job) => ({
    ts: job.started_at,
    label: format(new Date(job.started_at), 'MM/dd HH:mm'),
    platform: job.platform,
    value: job[metric],
    threshold:
      metric === 'start_ms'
        ? job.start_threshold
        : metric === 'span_ms'
          ? job.span_threshold
          : null,
    regression: job.regression === 1,
    commit: job.commit_sha ? job.commit_sha.slice(0, 7) : '',
  }));

  const merged: Record<string, Record<string, number | string | null>> = {};
  for (const row of chartData) {
    const key = String(row.ts);
    merged[key] = merged[key] || { ts: row.ts, label: row.label };
    merged[key][row.platform] = row.value ?? null;
    if (row.threshold != null) merged[key]['threshold'] = row.threshold;
    if (row.regression) merged[key][`${row.platform}_reg`] = 1;
  }
  const mergedArr = Object.values(merged).sort((a, b) =>
    Number(a.ts) - Number(b.ts),
  );

  // Compute average threshold for reference line
  const thresholds = chartData.filter((r) => r.threshold != null).map((r) => r.threshold!);
  const avgThreshold = thresholds.length > 0
    ? thresholds.reduce((a, b) => a + b, 0) / thresholds.length
    : null;

  const metricInfo = METRICS.find((m) => m.key === metric)!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDotClick = (_e: any, payload: any) => {
    const ts = String(payload?.payload?.ts ?? payload?.ts);
    const jobId = tsToJobId[ts];
    if (jobId && onJobClick) onJobClick(jobId);
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
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
        <Select
          label="时间范围"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[
            { value: '7', label: '7 天' },
            { value: '14', label: '14 天' },
            { value: '30', label: '30 天' },
            { value: '60', label: '60 天' },
          ]}
        />
      </div>

      {loading && <ChartSkeleton />}
      {error && <ErrorBanner message={error} />}

      {!loading && !error && (
        <div className="bg-perf-card border border-perf-surface rounded-lg p-4">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={mergedArr} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-perf-surface)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-perf-text-dim)', fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--color-perf-text-dim)', fontSize: 11 }}
                tickFormatter={(v) => metricInfo.unit ? `${v}${metricInfo.unit}` : String(v)}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.15)' }}
                contentStyle={{
                  background: 'var(--color-perf-surface)',
                  border: '1px solid var(--color-perf-border)',
                  borderRadius: 8,
                }}
                labelStyle={{ color: 'var(--color-perf-text)', fontSize: 12 }}
                itemStyle={{ fontSize: 12 }}
                formatter={(v: number) =>
                  metricInfo.unit ? `${Math.round(v)}${metricInfo.unit}` : String(Math.round(v))
                }
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-perf-text-dim)' }} />

              {avgThreshold != null && metric !== 'fc_count' && (
                <ReferenceLine
                  y={avgThreshold}
                  stroke="var(--color-status-regression)"
                  strokeDasharray="6 3"
                  label={{ value: '阈值', fill: 'var(--color-status-regression)', fontSize: 11, position: 'right' }}
                />
              )}

              {platformsToShow.map((p) => (
                <Line
                  key={p}
                  type="monotone"
                  dataKey={p}
                  name={platformLabel(p)}
                  stroke={getPlatformColor(p)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 5,
                    cursor: 'pointer',
                    onClick: handleDotClick,
                  }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Regression events list */}
      {chartData.filter((r) => r.regression).length > 0 && (
        <div className="mt-3 px-3 py-2 bg-perf-reg-bg border border-err-border rounded-lg text-xs flex flex-wrap items-center gap-1.5">
          <span className="text-err-text font-semibold mr-2">⚠ 范围内检测到回归:</span>
          {chartData
            .filter((r) => r.regression)
            .slice(0, 5)
            .map((r) => (
              <span key={`${r.ts}-${r.platform}`} className="bg-err-bg text-err-text rounded-md px-2 py-0.5 text-[11px]">
                {platformLabel(r.platform)} {r.label} {r.commit && `(${r.commit})`}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
