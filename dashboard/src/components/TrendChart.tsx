import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { api } from '../api';
import type { PerfJob, Platform } from '../types';

const PLATFORM_COLORS: Record<string, string> = {
  ios:     '#60a5fa',
  android: '#34d399',
  web:     '#f59e0b',
  ext:     '#a78bfa',
  desktop: '#f472b6',
};

const METRICS = [
  { key: 'start_ms', label: 'Startup (tokensStartMs)', unit: 'ms' },
  { key: 'span_ms',  label: 'Refresh span (tokensSpanMs)', unit: 'ms' },
  { key: 'fc_count', label: 'Function calls', unit: '' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

interface Props {
  platforms: string[];
}

export function TrendChart({ platforms }: Props) {
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
      .catch((e) => { if (!cancelled) setError(String(e?.message || 'Failed to load trend data')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPlatform, days]);

  // Group by platform for multi-line chart
  const platformsToShow: Platform[] =
    selectedPlatform === 'all' ? platforms : [selectedPlatform];

  // Build chart data: one point per job, keyed by timestamp
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

  // When showing all platforms, flatten into { label, ios, android, ... }
  const merged: Record<string, Record<string, number | string | null>> = {};
  for (const row of chartData) {
    const key = String(row.ts);
    merged[key] = merged[key] || { ts: row.ts, label: row.label };
    merged[key][row.platform] = row.value ?? null;
    if (row.regression) merged[key][`${row.platform}_reg`] = 1;
  }
  const mergedArr = Object.values(merged).sort((a, b) =>
    Number(a.ts) - Number(b.ts),
  );

  const metricInfo = METRICS.find((m) => m.key === metric)!;

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Controls */}
      <div style={styles.controls}>
        <Select
          label="Platform"
          value={selectedPlatform}
          onChange={setSelectedPlatform}
          options={[{ value: 'all', label: 'All platforms' }, ...platforms.map((p) => ({ value: p, label: p }))]}
        />
        <Select
          label="Metric"
          value={metric}
          onChange={(v) => setMetric(v as MetricKey)}
          options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
        />
        <Select
          label="Range"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[
            { value: '7', label: '7 days' },
            { value: '14', label: '14 days' },
            { value: '30', label: '30 days' },
            { value: '60', label: '60 days' },
          ]}
        />
      </div>

      {loading && <div style={styles.loading}>Loading…</div>}
      {error && <div style={styles.error}>⚠ {error}</div>}

      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={mergedArr} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(v) => metricInfo.unit ? `${v}${metricInfo.unit}` : String(v)}
          />
          <Tooltip
            contentStyle={{ background: '#1e2533', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1', fontSize: 12 }}
            itemStyle={{ fontSize: 12 }}
            formatter={(v: number) =>
              metricInfo.unit ? `${Math.round(v)}${metricInfo.unit}` : String(Math.round(v))
            }
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />

          {platformsToShow.map((p) => (
            <Line
              key={p}
              type="monotone"
              dataKey={p}
              name={p}
              stroke={PLATFORM_COLORS[p] || '#94a3b8'}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Regression events list */}
      {chartData.filter((r) => r.regression).length > 0 && (
        <div style={styles.regressionBanner}>
          <span style={{ color: '#fca5a5', fontWeight: 600, marginRight: 8 }}>⚠ Regressions in range:</span>
          {chartData
            .filter((r) => r.regression)
            .slice(0, 5)
            .map((r) => (
              <span key={`${r.ts}-${r.platform}`} style={styles.regTag}>
                {r.platform} {r.label} {r.commit && `(${r.commit})`}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// ── tiny helpers ──────────────────────────────────────────────────────────

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={styles.selectLabel}>
      <span style={styles.selectLabelText}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  controls: {
    display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center',
  },
  selectLabel: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  selectLabelText: {
    fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  select: {
    background: '#1e2533', border: '1px solid #334155', borderRadius: 6,
    color: '#e2e8f0', padding: '6px 10px', fontSize: 13, cursor: 'pointer',
  },
  loading: {
    color: '#64748b', fontSize: 13, marginBottom: 8,
  },
  error: {
    color: '#fca5a5', fontSize: 13, marginBottom: 8,
    background: '#450a0a', border: '1px solid #7f1d1d',
    borderRadius: 6, padding: '8px 12px',
  },
  regressionBanner: {
    marginTop: 12, padding: '8px 12px', background: '#1a1a2e',
    border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12,
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
  },
  regTag: {
    background: '#450a0a', color: '#fca5a5', borderRadius: 4,
    padding: '2px 8px', fontSize: 11,
  },
};
