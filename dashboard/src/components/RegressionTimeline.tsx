import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../api';
import type { PerfJob } from '../types';

interface Props {
  platforms: string[];
}

const SEVERITY_COLOR: Record<string, string> = {
  P1: '#ef4444',
  P2: '#f59e0b',
  INFO: '#60a5fa',
};

const STATUS_ICON: Record<string, string> = {
  regression: '🔴',
  failed: '❌',
  recovered: '✅',
};

function fmt(v: number | null, unit = 'ms') {
  if (v == null) return '–';
  return `${Math.round(v)}${unit}`;
}

function fmtDelta(v: number | null) {
  if (v == null) return null;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export function RegressionTimeline({ platforms }: Props) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<PerfJob[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .regressions(selectedPlatform === 'all' ? undefined : selectedPlatform, days)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedPlatform, days]);

  return (
    <div>
      <div style={styles.controls}>
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
          <span style={styles.hint}>Range</span>
          <select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} style={styles.select}>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
          </select>
        </label>
      </div>

      {loading && <div style={styles.loading}>Loading…</div>}

      {!loading && data.length === 0 && (
        <div style={{ color: '#34d399', textAlign: 'center', padding: 40, fontSize: 15 }}>
          ✅ No regressions in selected range
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.map((job) => {
          const sev = job.severity;
          const deltaStart = fmtDelta(job.delta_pct_start);
          const deltaSpan = fmtDelta(job.delta_pct_span);
          return (
            <div key={job.job_id} style={{ ...styles.card, borderLeftColor: SEVERITY_COLOR[sev] || '#64748b' }}>
              <div style={styles.cardTop}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {STATUS_ICON[job.status] || '⚪'}{' '}
                  <span style={{ color: SEVERITY_COLOR[sev] || '#e2e8f0' }}>[{sev}]</span>{' '}
                  {job.platform}
                </span>
                <span style={styles.time}>
                  {format(new Date(job.started_at), 'yyyy-MM-dd HH:mm')}
                </span>
              </div>

              <div style={styles.cardMeta}>
                {job.branch && <Chip>{job.branch}</Chip>}
                {job.commit_sha && <Chip mono>{job.commit_sha.slice(0, 7)}</Chip>}
                {job.app_version && <Chip>{job.app_version}</Chip>}
              </div>

              <div style={styles.metrics}>
                <MetricPill
                  label="Startup"
                  value={fmt(job.start_ms)}
                  threshold={fmt(job.start_threshold)}
                  delta={deltaStart}
                  bad={!!job.delta_pct_start && job.delta_pct_start > 0}
                />
                <MetricPill
                  label="Refresh"
                  value={fmt(job.span_ms)}
                  threshold={fmt(job.span_threshold)}
                  delta={deltaSpan}
                  bad={!!job.delta_pct_span && job.delta_pct_span > 0}
                />
                <MetricPill
                  label="Fn calls"
                  value={job.fc_count != null ? String(Math.round(job.fc_count)) : '–'}
                  threshold={null}
                  delta={null}
                  bad={false}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span style={{
      background: '#1e2533', border: '1px solid #334155', borderRadius: 4,
      padding: '2px 7px', fontSize: 11, color: '#94a3b8',
      fontFamily: mono ? 'monospace' : undefined,
    }}>
      {children}
    </span>
  );
}

function MetricPill({
  label, value, threshold, delta, bad,
}: {
  label: string; value: string; threshold: string | null; delta: string | null; bad: boolean;
}) {
  return (
    <div style={{
      background: '#0f1420', borderRadius: 6, padding: '6px 10px', fontSize: 12,
      border: `1px solid ${bad ? '#7f1d1d' : '#1e2533'}`,
    }}>
      <div style={{ color: '#64748b', fontSize: 10, marginBottom: 2 }}>{label}</div>
      <span style={{ color: bad ? '#fca5a5' : '#e2e8f0', fontWeight: 600 }}>{value}</span>
      {threshold && <span style={{ color: '#64748b' }}> / {threshold}</span>}
      {delta && (
        <span style={{ color: bad ? '#f87171' : '#34d399', marginLeft: 6, fontSize: 11 }}>
          {delta}
        </span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  controls: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'flex-end' },
  selectLabel: { display: 'flex', flexDirection: 'column', gap: 4 },
  hint: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' },
  select: {
    background: '#1e2533', border: '1px solid #334155', borderRadius: 6,
    color: '#e2e8f0', padding: '6px 10px', fontSize: 13, cursor: 'pointer',
  },
  loading: { color: '#64748b', fontSize: 13, marginBottom: 8 },
  card: {
    background: '#141820', border: '1px solid #1e2533',
    borderLeft: '3px solid #64748b', borderRadius: 8,
    padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardMeta: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  metrics: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  time: { fontSize: 12, color: '#64748b' },
};
