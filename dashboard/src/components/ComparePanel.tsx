import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { api } from '../api';
import type { CompareRow } from '../types';

const METRICS = [
  { key: 'avg_start_ms', label: 'Startup ms' },
  { key: 'avg_span_ms',  label: 'Refresh span ms' },
  { key: 'avg_fc_count', label: 'Function calls' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

interface Props {
  platforms: string[];
}

function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export function ComparePanel({ platforms }: Props) {
  const today = new Date();
  const [dateA, setDateA] = useState(toDateStr(subDays(today, 1)));
  const [dateB, setDateB] = useState(toDateStr(today));
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [metric, setMetric] = useState<MetricKey>('avg_start_ms');
  const [dataA, setDataA] = useState<CompareRow[]>([]);
  const [dataB, setDataB] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const p = selectedPlatform === 'all' ? undefined : selectedPlatform;
    Promise.all([
      api.compare(dateA, dateA, p),
      api.compare(dateB, dateB, p),
    ])
      .then(([a, b]) => { setDataA(a); setDataB(b); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dateA, dateB, selectedPlatform]);

  // Build chart data: one bar-group per platform
  const platformsToShow =
    selectedPlatform === 'all' ? platforms : [selectedPlatform];

  const chartData = platformsToShow.map((p) => {
    const rowA = dataA.find((r) => r.platform === p);
    const rowB = dataB.find((r) => r.platform === p);
    return {
      platform: p,
      [dateA]: rowA?.[metric] ?? null,
      [dateB]: rowB?.[metric] ?? null,
    };
  }).filter((r) => r[dateA] != null || r[dateB] != null);

  const delta = (a: number | null, b: number | null) => {
    if (a == null || b == null || a === 0) return null;
    return (((b - a) / a) * 100).toFixed(1);
  };

  return (
    <div>
      {/* Controls */}
      <div style={styles.controls}>
        <label style={styles.selectLabel}>
          <span style={styles.hint}>Date A</span>
          <input
            type="date"
            value={dateA}
            onChange={(e) => setDateA(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.selectLabel}>
          <span style={styles.hint}>Date B</span>
          <input
            type="date"
            value={dateB}
            onChange={(e) => setDateB(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.selectLabel}>
          <span style={styles.hint}>Platform</span>
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            style={styles.select}
          >
            <option value="all">All platforms</option>
            {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={styles.selectLabel}>
          <span style={styles.hint}>Metric</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            style={styles.select}
          >
            {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      </div>

      {loading && <div style={styles.loading}>Loading…</div>}

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis dataKey="platform" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#1e2533', border: '1px solid #334155', borderRadius: 8 }}
            itemStyle={{ fontSize: 12 }}
            formatter={(v: number) => `${Math.round(v)}`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar dataKey={dateA} name={`${dateA} (A)`} fill="#60a5fa" radius={[4, 4, 0, 0]} />
          <Bar dataKey={dateB} name={`${dateB} (B)`} fill="#34d399" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Delta table */}
      {chartData.length > 0 && (
        <div style={styles.table}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Platform', `${dateA} (A)`, `${dateB} (B)`, 'Δ %'].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
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
                  <tr key={row.platform}>
                    <td style={styles.td}>{row.platform}</td>
                    <td style={styles.td}>{a != null ? Math.round(a) : '–'}</td>
                    <td style={styles.td}>{b != null ? Math.round(b) : '–'}</td>
                    <td style={{
                      ...styles.td,
                      color: isWorse ? '#f87171' : isBetter ? '#34d399' : '#94a3b8',
                      fontWeight: 600,
                    }}>
                      {d != null ? `${parseFloat(d) > 0 ? '+' : ''}${d}%` : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  controls: {
    display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'flex-end',
  },
  selectLabel: { display: 'flex', flexDirection: 'column', gap: 4 },
  hint: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    background: '#1e2533', border: '1px solid #334155', borderRadius: 6,
    color: '#e2e8f0', padding: '6px 10px', fontSize: 13,
    colorScheme: 'dark',
  },
  select: {
    background: '#1e2533', border: '1px solid #334155', borderRadius: 6,
    color: '#e2e8f0', padding: '6px 10px', fontSize: 13, cursor: 'pointer',
  },
  loading: { color: '#64748b', fontSize: 13, marginBottom: 8 },
  table: { marginTop: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid #1e2533' },
  th: {
    background: '#1e2533', color: '#64748b', textAlign: 'left',
    padding: '8px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  td: {
    padding: '8px 12px', borderTop: '1px solid #1a1f2e', color: '#e2e8f0',
  },
};
