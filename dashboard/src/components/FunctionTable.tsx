import { useEffect, useState } from 'react';
import { api } from '../api';
import { Select } from './ui/Select';
import { ErrorBanner } from './ui/ErrorBanner';
import { TableSkeleton } from './ui/Skeleton';
import { platformLabel } from '../constants';
import type { PerfFnStat } from '../types';

type SortKey = keyof PerfFnStat;

interface Props {
  platforms: string[];
}

const PAGE_SIZE = 20;

export function FunctionTable({ platforms }: Props) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [days, setDays] = useState(7);
  const [data, setData] = useState<PerfFnStat[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('avg_p95_ms');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .functions(
        selectedPlatform === 'all' ? undefined : selectedPlatform,
        days,
        PAGE_SIZE,
        page,
        'previous',
      )
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
          setTotal(res.total);
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e?.message || '加载函数数据失败')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPlatform, days, page]);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cols: { key: SortKey; label: string; fmt?: (v: number | null) => string }[] = [
    { key: 'fn_name', label: '函数' },
    { key: 'fn_module', label: '模块' },
    { key: 'session_count', label: '会话数', fmt: (v) => String(v ?? '–') },
    { key: 'avg_call_count', label: '平均调用', fmt: (v) => v != null ? v.toFixed(1) : '–' },
    { key: 'avg_p95_ms', label: 'p95(平均)', fmt: (v) => v != null ? `${v.toFixed(1)}ms` : '–' },
    { key: 'max_p95_ms', label: 'p95(最大)', fmt: (v) => v != null ? `${v.toFixed(1)}ms` : '–' },
    { key: 'avg_avg_ms', label: '平均耗时', fmt: (v) => v != null ? `${v.toFixed(1)}ms` : '–' },
    { key: 'delta_avg_p95_ms' as SortKey, label: 'Δ p95', fmt: (v) => {
      if (v == null) return '–';
      const sign = v > 0 ? '+' : '';
      return `${sign}${v.toFixed(1)}ms`;
    }},
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <Select
          label="平台"
          value={selectedPlatform}
          onChange={(v) => { setSelectedPlatform(v); setPage(1); }}
          options={[{ value: 'all', label: '全部平台' }, ...platforms.map((p) => ({ value: p, label: platformLabel(p) }))]}
        />
        <Select
          label="时间范围"
          value={String(days)}
          onChange={(v) => { setDays(Number(v)); setPage(1); }}
          options={[
            { value: '3', label: '3 天' },
            { value: '7', label: '7 天' },
            { value: '14', label: '14 天' },
            { value: '30', label: '30 天' },
          ]}
        />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-perf-muted uppercase tracking-wider">搜索</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索函数或模块..."
            className="bg-perf-surface border border-perf-border rounded-lg text-perf-text px-2.5 py-1.5 text-[13px] w-[200px] placeholder:text-perf-muted outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 focus-visible:border-perf-accent/60"
          />
        </label>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? <TableSkeleton rows={PAGE_SIZE} cols={cols.length} /> : (
        <div className="rounded-lg overflow-auto border border-perf-surface">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => handleSort(c.key)}
                    className={`bg-perf-surface text-left px-3 py-2 text-[11px] uppercase tracking-wider whitespace-nowrap sticky top-0 cursor-pointer select-none ${
                      sortKey === c.key ? 'text-perf-accent' : 'text-perf-muted'
                    }`}
                  >
                    {c.label}
                    {sortKey === c.key && (sortAsc ? ' ↑' : ' ↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={i} className={`hover:bg-perf-hover transition-colors ${i % 2 === 0 ? '' : 'bg-perf-row-alt'}`}>
                  {cols.map((c) => {
                    const raw = row[c.key as keyof PerfFnStat];
                    const display = c.fmt
                      ? c.fmt(raw as number | null)
                      : String(raw ?? '–');
                    const isHighP95 =
                      c.key === 'avg_p95_ms' &&
                      raw != null &&
                      (raw as number) > 100;
                    const isDeltaBad =
                      c.key === 'delta_avg_p95_ms' &&
                      raw != null &&
                      (raw as number) > 0;
                    const isDeltaGood =
                      c.key === 'delta_avg_p95_ms' &&
                      raw != null &&
                      (raw as number) < 0;
                    return (
                      <td
                        key={c.key}
                        className={`px-3 py-[7px] border-t border-perf-surface/50 text-perf-text ${
                          isHighP95 ? 'text-err-text font-semibold' :
                          isDeltaBad ? 'text-status-regression font-semibold' :
                          isDeltaGood ? 'text-status-ok font-semibold' : ''
                        } ${c.key === 'fn_name' ? 'font-mono text-xs max-w-[280px] overflow-hidden text-ellipsis whitespace-nowrap' : ''}`}
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
                  <td colSpan={cols.length} className="px-3 py-6 text-perf-muted text-center border-t border-perf-surface/50">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-perf-muted">
            第 {page} 页，共 {totalPages} 页（{total} 个函数）
          </span>
          <div className="flex gap-2">
            <PaginationButton
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              上一页
            </PaginationButton>
            <PaginationButton
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              下一页
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationButton({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 text-xs rounded-lg bg-perf-surface border border-perf-border text-perf-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:bg-perf-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50"
    >
      {children}
    </button>
  );
}
