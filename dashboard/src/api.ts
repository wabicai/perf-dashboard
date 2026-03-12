import type { PerfJob, PerfFnStat, CompareRow } from './types';

const BASE = import.meta.env.VITE_WORKER_URL || '';

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  platforms: () => get<string[]>('/api/platforms'),
  summary: () => get<PerfJob[]>('/api/summary'),
  trend: (platform?: string, days?: number) =>
    get<PerfJob[]>('/api/trend', {
      ...(platform ? { platform } : {}),
      days: String(days ?? 30),
    }),
  compare: (from: string, to: string, platform?: string) =>
    get<CompareRow[]>('/api/compare', {
      from,
      to,
      ...(platform ? { platform } : {}),
    }),
  functions: (platform?: string, days?: number, limit?: number) =>
    get<PerfFnStat[]>('/api/functions', {
      ...(platform ? { platform } : {}),
      days: String(days ?? 7),
      limit: String(limit ?? 20),
    }),
  regressions: (platform?: string, days?: number) =>
    get<PerfJob[]>('/api/regressions', {
      ...(platform ? { platform } : {}),
      days: String(days ?? 30),
    }),
};
