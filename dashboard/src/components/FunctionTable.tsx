import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PerfFnStat } from '../types';

type SortKey = keyof PerfFnStat;

interface Props {
  platforms: string[];
}

export function FunctionTable({ platforms }: Props) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [days, setDays] = useState(7);
  const [data, setData] = useState<PerfFnStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('avg_p95_ms');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .functions(selectedPlatform === 'all' ? undefined : selectedPlatform, days, 50)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedPlatform, days]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const filtered = data.filter(
    (r) =>
      !filter ||
      r.fn_name.toLowerCase().includes(filter.toLowerCase()) ||
      (r.fn_module ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] as number | null;
    const bv = b[sortKey] as number | null;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortAsc ? av - bv : bv - av;
  });

  const cols: { key: SortKey; label: string; fmt?: (v: number | null) => string }[] = [
    { key: 'fn_name', label: 'Function' },
    { key: 'fn_module', label: 'Module' },
    { key: 'session_count', label: 'Sessions', fmt: (v) => String(v ?? '–') },
    { key: 'avg_call_count', label: 'Avg calls', fmt: (v) => v != null ? v.toFixed(1) : '–' },
    { key: 'avg_p95_ms', label: 'p95 ms (avg)', fmt: (v) => v != null ? `${v.toFixed(1)}ms` : '–' },
    { key: 'max_p95_ms', label: 'p95 ms (max)', fmt: (v) => v != null ? `${v.toFixed(1)}ms` : '–' },
    { key: 'avg_avg_ms', label: 'Avg ms', fmt: (v) => v != null ? `${v.toFixed(1)}ms` : '–' },
  ];

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
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <label style={styles.selectLabel}>
          <span style={styles.hint}>Search</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="function or module…"
            style={{ ...styles.select, width: 200 }}
          />
        </label>
      </div>

      {loading && <div style={styles.loading}>Loading…</div>}

      <div style={styles.tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  style={{
                    ...styles.th,
                    cursor: 'pointer',
                    color: sortKey === c.key ? '#93c5fd' : '#64748b',
                  }}
                >
                  {c.label}
                  {sortKey === c.key && (sortAsc ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 50).map((row, i) => (
              <tr key={i} style={i % 2 === 0 ? {} : { background: '#0f1420' }}>
                {cols.map((c) => {
                  const raw = row[c.key];
                  const display = c.fmt
                    ? c.fmt(raw as number | null)
                    : String(raw ?? '–');
                  const isHighP95 =
                    c.key === 'avg_p95_ms' &&
                    raw != null &&
                    (raw as number) > 100;
                  return (
                    <td
                      key={c.key}
                      style={{
                        ...styles.td,
                        ...(isHighP95 ? { color: '#fca5a5', fontWeight: 600 } : {}),
                        ...(c.key === 'fn_name' ? { fontFamily: 'monospace', fontSize: 12 } : {}),
                        maxWidth: c.key === 'fn_name' ? 280 : undefined,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={display}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
            {sorted.length === 0 && !loading && (
              <tr>
                <td colSpan={cols.length} style={{ ...styles.td, color: '#64748b', textAlign: 'center', padding: 24 }}>
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > 50 && (
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8, textAlign: 'right' }}>
          Showing 50 / {sorted.length}
        </div>
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
  tableWrap: { borderRadius: 8, overflow: 'auto', border: '1px solid #1e2533' },
  th: {
    background: '#1e2533', textAlign: 'left', padding: '8px 12px',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap', position: 'sticky', top: 0,
  },
  td: { padding: '7px 12px', borderTop: '1px solid #1a1f2e', color: '#e2e8f0' },
};
