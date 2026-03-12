import { useEffect, useState } from 'react';
import { api } from './api';
import { TrendChart } from './components/TrendChart';
import { ComparePanel } from './components/ComparePanel';
import { FunctionTable } from './components/FunctionTable';
import { RegressionTimeline } from './components/RegressionTimeline';
import type { PerfJob } from './types';

type Tab = 'trend' | 'compare' | 'functions' | 'regressions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'trend', label: 'Trend' },
  { id: 'compare', label: 'Compare' },
  { id: 'functions', label: 'Functions' },
  { id: 'regressions', label: 'Regressions' },
];

const STATUS_COLOR: Record<string, string> = {
  ok: '#34d399',
  regression: '#ef4444',
  failed: '#f59e0b',
};

function SummaryCard({ job }: { job: PerfJob }) {
  const color = STATUS_COLOR[job.status] || '#64748b';
  return (
    <div style={{
      background: '#141820', border: `1px solid ${color}33`,
      borderTop: `2px solid ${color}`,
      borderRadius: 8, padding: '12px 16px', minWidth: 180, flex: '1 1 180px',
    }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {job.platform}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>
          {job.start_ms != null ? `${Math.round(job.start_ms)}ms` : '–'}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>startup</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>
          {job.span_ms != null ? `${Math.round(job.span_ms)}ms` : '–'}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>refresh</span>
      </div>
      <div style={{
        display: 'inline-block', fontSize: 11, fontWeight: 600,
        color: color, background: `${color}18`, borderRadius: 4, padding: '2px 7px',
      }}>
        {job.status}
      </div>
      {job.app_version && (
        <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{job.app_version}</div>
      )}
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('trend');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [summary, setSummary] = useState<PerfJob[]>([]);

  useEffect(() => {
    api.platforms().then(setPlatforms).catch(console.error);
    api.summary().then(setSummary).catch(console.error);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0d14', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1e2533', padding: '0 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0 0' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>Perf Dashboard</span>
            <span style={{ fontSize: 12, color: '#475569', background: '#1e2533', borderRadius: 4, padding: '2px 8px' }}>
              OneKey Performance Analytics
            </span>
          </div>

          {/* Summary cards */}
          {summary.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '16px 0' }}>
              {summary.map((job) => <SummaryCard key={job.job_id} job={job} />)}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 18px', fontSize: 13, fontWeight: 500,
                  color: tab === t.id ? '#60a5fa' : '#64748b',
                  borderBottom: tab === t.id ? '2px solid #60a5fa' : '2px solid transparent',
                  transition: 'color 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {tab === 'trend' && <TrendChart platforms={platforms} />}
        {tab === 'compare' && <ComparePanel platforms={platforms} />}
        {tab === 'functions' && <FunctionTable platforms={platforms} />}
        {tab === 'regressions' && <RegressionTimeline platforms={platforms} />}
      </div>
    </div>
  );
}
