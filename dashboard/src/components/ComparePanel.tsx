import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { subDays } from 'date-fns';
import { api } from '../api';
import { Select } from './ui/Select';
import { ErrorBanner } from './ui/ErrorBanner';
import { ChartSkeleton } from './ui/Skeleton';
import { platformLabel } from '../constants';
import type { CompareRow, VersionSummary } from '../types';

const METRICS = [
  { key: 'avg_start_ms', label: '启动延迟' },
  { key: 'avg_span_ms', label: '刷新耗时' },
  { key: 'avg_fc_count', label: '函数调用次数' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];
type CompareMode = 'date' | 'version';

interface Props {
  platforms: string[];
  onJobClick?: (jobId: string) => void;
}

function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export function ComparePanel({ platforms }: Props) {
  const today = new Date();
  const [mode, setMode] = useState<CompareMode>('date');

  // Date mode
  const [dateA, setDateA] = useState(toDateStr(subDays(today, 1)));
  const [dateB, setDateB] = useState(toDateStr(today));
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [metric, setMetric] = useState<MetricKey>('avg_start_ms');
  const [dataA, setDataA] = useState<CompareRow[]>([]);
  const [dataB, setDataB] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Version mode
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionA, setVersionA] = useState<string>('');
  const [versionB, setVersionB] = useState<string>('');
  const [versionPlatform, setVersionPlatform] = useState<string>('all');
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Fetch version list
  useEffect(() => {
    if (mode !== 'version') return;
    setVersionsLoading(true);
    const p = versionPlatform === 'all' ? undefined : versionPlatform;
    api.versions(p, 90).then((vs) => {
      setVersions(vs);
      const distinct = [...new Set(vs.map((v) => v.app_version))];
      if (distinct.length >= 2) {
        setVersionA(distinct[1]);
        setVersionB(distinct[0]);
      } else if (distinct.length === 1) {
        setVersionA(distinct[0]);
        setVersionB(distinct[0]);
      }
    }).catch(() => {}).finally(() => setVersionsLoading(false));
  }, [mode, versionPlatform]);

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

  // ── Date mode chart data ─────────────────────────────────────────────────
  const platformsToShow = selectedPlatform === 'all' ? platforms : [selectedPlatform];
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

  const thresholdKey = metric === 'avg_start_ms' ? 'avg_start_threshold'
    : metric === 'avg_span_ms' ? 'avg_span_threshold'
    : 'avg_fc_threshold';
  const thresholdVals = [...dataA, ...dataB]
    .map((r) => r[thresholdKey])
    .filter((v): v is number => v != null && Number.isFinite(v));
  const avgThreshold = thresholdVals.length > 0
    ? thresholdVals.reduce((a, b) => a + b, 0) / thresholdVals.length
    : null;

  // ── Version mode data ────────────────────────────────────────────────────
  const versionMetricKey = metric === 'avg_start_ms' ? 'avg_start_ms'
    : metric === 'avg_span_ms' ? 'avg_span_ms'
    : 'avg_fc_count';
  const versionThresholdKey = metric === 'avg_start_ms' ? 'avg_start_threshold'
    : metric === 'avg_span_ms' ? 'avg_span_threshold'
    : null;

  // Group by platform for version mode chart
  const versionChartData = platforms.map((p) => {
    const rowA = versions.find((v) => v.app_version === versionA && v.platform === p);
    const rowB = versions.find((v) => v.app_version === versionB && v.platform === p);
    return {
      platform: p,
      platformLabel: platformLabel(p),
      [versionA || 'A']: rowA?.[versionMetricKey] ?? null,
      [versionB || 'B']: rowB?.[versionMetricKey] ?? null,
      threshold: (versionThresholdKey && (rowA?.[versionThresholdKey] ?? rowB?.[versionThresholdKey])) ?? null,
    };
  }).filter((r) => r[versionA || 'A'] != null || r[versionB || 'B'] != null);

  const versionThresholdVals = versionChartData
    .map((r) => r.threshold)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const versionAvgThreshold = versionThresholdVals.length > 0
    ? versionThresholdVals.reduce((a, b) => a + b, 0) / versionThresholdVals.length
    : null;

  const delta = (a: number | null, b: number | null) => {
    if (a == null || b == null || a === 0) return null;
    return (((b - a) / a) * 100).toFixed(1);
  };

  // Distinct version list for dropdowns
  const distinctVersions = [...new Set(versions.map((v) => v.app_version))];

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 bg-perf-surface/50 rounded-lg p-1 w-fit">
        {(['date', 'version'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-[13px] font-medium rounded-md border-none cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 ${
              mode === m
                ? 'bg-perf-surface text-perf-text'
                : 'bg-transparent text-perf-muted hover:text-perf-text-dim'
            }`}
          >
            {m === 'date' ? '按日期' : '按版本'}
          </button>
        ))}
      </div>

      {/* ── Date mode controls ──────────────────────────────────────────── */}
      {mode === 'date' && (
        <div className="flex flex-wrap gap-3 mb-5 items-end">
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
        </div>
      )}

      {/* ── Version mode controls ───────────────────────────────────────── */}
      {mode === 'version' && (
        <div className="flex flex-wrap gap-3 mb-5 items-end">
          <Select
            label="平台筛选"
            value={versionPlatform}
            onChange={setVersionPlatform}
            options={[{ value: 'all', label: '全部平台' }, ...platforms.map((p) => ({ value: p, label: platformLabel(p) }))]}
          />
          <Select
            label="指标"
            value={metric}
            onChange={(v) => setMetric(v as MetricKey)}
            options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
          />
          <Select
            label="版本 A（基准）"
            value={versionA}
            onChange={setVersionA}
            options={distinctVersions.map((v) => ({ value: v, label: v }))}
          />
          <Select
            label="版本 B（对比）"
            value={versionB}
            onChange={setVersionB}
            options={distinctVersions.map((v) => ({ value: v, label: v }))}
          />
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* ── Date mode chart ─────────────────────────────────────────────── */}
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
                    cursor={false}
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

          {chartData.length > 0 && (
            <DeltaTable
              rows={chartData.map((row) => ({
                label: platformLabel(row.platform),
                a: row[dateA] as number | null,
                b: row[dateB] as number | null,
              }))}
              labelA={`${dateA} (A)`}
              labelB={`${dateB} (B)`}
            />
          )}
        </>
      )}

      {/* ── Version mode chart ──────────────────────────────────────────── */}
      {mode === 'version' && (
        <>
          {versionsLoading ? <ChartSkeleton /> : distinctVersions.length === 0 ? (
            <div className="text-perf-muted text-center py-10 text-sm">
              暂无版本数据（需要 app_version 字段，最新 CI 运行后才有）
            </div>
          ) : (
            <>
              <div className="bg-perf-card border border-perf-surface rounded-lg p-4">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={versionChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-perf-surface)" />
                    <XAxis dataKey="platformLabel" tick={{ fill: 'var(--color-perf-text-dim)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--color-perf-text-dim)', fontSize: 11 }} />
                    <Tooltip
                      cursor={false}
                      contentStyle={{
                        background: 'var(--color-perf-surface)',
                        border: '1px solid var(--color-perf-border)',
                        borderRadius: 8,
                      }}
                      itemStyle={{ fontSize: 12 }}
                      formatter={(v: number) => `${Math.round(v)}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-perf-text-dim)' }} />
                    <Bar dataKey={versionA || 'A'} name={`v${versionA} (A)`} fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={versionB || 'B'} name={`v${versionB} (B)`} fill="#34d399" radius={[4, 4, 0, 0]} />
                    {versionAvgThreshold != null && metric !== 'avg_fc_count' && (
                      <ReferenceLine
                        y={versionAvgThreshold}
                        stroke="var(--color-status-regression)"
                        strokeDasharray="6 3"
                        label={{ value: '阈值', fill: 'var(--color-status-regression)', fontSize: 11, position: 'insideTopRight' }}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Version summary cards */}
              {(versionA || versionB) && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { ver: versionA, label: 'A（基准）', color: '#60a5fa' },
                    { ver: versionB, label: 'B（对比）', color: '#34d399' },
                  ].map(({ ver, label, color }) => {
                    const rows = versions.filter((v) => v.app_version === ver);
                    if (!rows.length) return null;
                    const totalJobs = rows.reduce((s, r) => s + r.job_count, 0);
                    const regressions = rows.reduce((s, r) => s + r.regression_count, 0);
                    const lastSeen = Math.max(...rows.map((r) => r.last_seen));
                    return (
                      <div key={ver} className="bg-perf-card border border-perf-surface rounded-lg p-3" style={{ borderTopColor: color, borderTopWidth: 2 }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold" style={{ color }}>v{ver} <span className="text-perf-muted text-xs font-normal">{label}</span></span>
                          <span className="text-xs text-perf-muted">{format(new Date(lastSeen), 'MM/dd HH:mm')} 最新</span>
                        </div>
                        <div className="text-xs text-perf-muted mb-2">{totalJobs} 次 CI · {regressions > 0 ? <span className="text-status-regression">{regressions} 次超标</span> : <span className="text-status-ok">无超标</span>}</div>
                        <div className="flex flex-wrap gap-2">
                          {rows.map((r) => (
                            <div key={r.platform} className="bg-perf-row-alt rounded-md px-2 py-1 text-xs">
                              <div className="text-perf-muted text-[10px]">{platformLabel(r.platform)}</div>
                              <div className="text-perf-text font-medium">
                                {r.avg_start_ms != null ? `启动 ${Math.round(r.avg_start_ms)}ms` : '–'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {versionChartData.length > 0 && (
                <DeltaTable
                  rows={versionChartData.map((row) => ({
                    label: platformLabel(row.platform),
                    a: row[versionA || 'A'] as number | null,
                    b: row[versionB || 'B'] as number | null,
                  }))}
                  labelA={`v${versionA} (A)`}
                  labelB={`v${versionB} (B)`}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function DeltaTable({ rows, labelA, labelB }: {
  rows: { label: string; a: number | null; b: number | null }[];
  labelA: string;
  labelB: string;
}) {
  const delta = (a: number | null, b: number | null) => {
    if (a == null || b == null || a === 0) return null;
    return (((b - a) / a) * 100).toFixed(1);
  };

  return (
    <div className="mt-4 rounded-lg overflow-hidden border border-perf-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {['平台', labelA, labelB, 'Δ %'].map((h) => (
              <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const d = delta(row.a, row.b);
            const isWorse = d != null && parseFloat(d) > 5;
            const isBetter = d != null && parseFloat(d) < -5;
            return (
              <tr key={row.label} className="hover:bg-perf-hover transition-colors">
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text">{row.label}</td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">{row.a != null ? Math.round(row.a) : '–'}</td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">{row.b != null ? Math.round(row.b) : '–'}</td>
                <td className={`px-3 py-2 border-t border-perf-surface/50 font-semibold ${isWorse ? 'text-status-regression' : isBetter ? 'text-status-ok' : 'text-perf-text-dim'}`}>
                  {d != null ? `${parseFloat(d) > 0 ? '+' : ''}${d}%` : '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
