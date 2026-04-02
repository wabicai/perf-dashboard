import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../api';
import { ErrorBanner } from './ui/ErrorBanner';
import { Skeleton } from './ui/Skeleton';
import { Chip } from './ui/Chip';
import { platformLabel, statusLabel } from '../constants';
import type { JobDetailResponse, PerfRun, PerfFnStat, SessionInsights, InsightFunction, LowFps, KeyMarks } from '../types';

interface Props {
  jobId: string;
  onClose: () => void;
}

export function JobDetailModal({ jobId, onClose }: Props) {
  const [data, setData] = useState<JobDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.jobDetail(jobId)
      .then(setData)
      .catch((e) => setError(String(e?.message || '加载任务详情失败')))
      .finally(() => setLoading(false));
  }, [jobId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 animate-backdrop-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-perf-bg border border-perf-surface rounded-xl w-full max-w-[900px] shadow-2xl animate-modal-in flex flex-col max-h-[90vh]">
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-perf-surface flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-perf-text m-0">任务详情</h2>
            <span className="text-xs text-perf-muted font-mono">{jobId}</span>
          </div>
          <button
            onClick={onClose}
            className="text-perf-muted hover:text-perf-text bg-transparent border-none cursor-pointer text-xl leading-none p-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading && (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
          {error && <ErrorBanner message={error} />}

          {data && (
            <div className="flex flex-col gap-6">
              {/* Job summary */}
              <JobSummary job={data.job} />

              {/* Key marks timeline — when did each phase happen */}
              {data.insights?.key_marks && (
                <KeyMarksSection keyMarks={data.insights.key_marks} />
              )}

              {/* Home refresh window hotspot */}
              {data.insights?.home_refresh && data.insights.home_refresh.topFunctions.length > 0 && (
                <HomeRefreshSection homeRefresh={data.insights.home_refresh} />
              )}

              {/* JS thread block events */}
              {data.insights?.jsblock && data.insights.jsblock.topWindows.length > 0 && (
                <JsBlockSection jsblock={data.insights.jsblock} />
              )}

              {/* Low FPS windows */}
              {data.insights?.low_fps && data.insights.low_fps.topWindows.length > 0 && (
                <LowFpsSection lowFps={data.insights.low_fps} />
              )}

              {/* Rapid repeated calls */}
              {data.insights?.repeated_calls && data.insights.repeated_calls.length > 0 && (
                <RepeatedCallsSection calls={data.insights.repeated_calls} sessionCount={data.insights.sessionCount} />
              )}

              {/* No insights available for this platform */}
              {!data.insights && (
                <div className="text-xs text-perf-muted bg-perf-card border border-perf-surface rounded-lg p-4">
                  此平台暂无 JS 线程分析数据（jsblock / low_fps / key_marks 需要 performance-server 采集支持）。
                </div>
              )}

              {/* Top slow functions — overall session aggregate */}
              {data.fn_stats.length > 0 && <SlowFunctions fnStats={data.fn_stats} />}

              {/* Per-run raw data */}
              {data.runs.length > 0 && <RunsTable runs={data.runs} job={data.job} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobSummary({ job }: { job: JobDetailResponse['job'] }) {
  return (
    <div className="bg-perf-card border border-perf-surface rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm font-semibold">{platformLabel(job.platform)}</span>
        <span className={`text-[11px] font-semibold rounded-md px-1.5 py-0.5 ${
          job.status === 'ok' ? 'text-status-ok bg-status-ok/10' :
          job.status === 'regression' ? 'text-status-regression bg-status-regression/10' :
          'text-status-failed bg-status-failed/10'
        }`}>
          {statusLabel(job.status)}
        </span>
        <span className="text-xs text-perf-muted">
          {format(new Date(job.started_at), 'yyyy-MM-dd HH:mm:ss')}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {job.branch && <Chip>{job.branch}</Chip>}
        {job.commit_sha && <Chip mono>{job.commit_sha.slice(0, 7)}</Chip>}
        {job.app_version && <Chip>v{job.app_version}</Chip>}
        {job.run_count != null && <Chip>{job.run_count} 轮</Chip>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="启动" value={job.start_ms} unit="ms" threshold={job.start_threshold} delta={job.delta_pct_start} />
        <MetricCard label="刷新" value={job.span_ms} unit="ms" threshold={job.span_threshold} delta={job.delta_pct_span} />
        <MetricCard label="函数调用" value={job.fc_count} threshold={job.fc_threshold} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, unit, threshold, delta }: {
  label: string; value: number | null; unit?: string; threshold?: number | null; delta?: number | null;
}) {
  const bad = delta != null && delta > 0;
  return (
    <div className={`bg-perf-row-alt rounded-lg p-3 border ${bad ? 'border-err-border' : 'border-perf-surface'}`}>
      <div className="text-[10px] text-perf-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold text-perf-text">
        {value != null ? `${Math.round(value)}${unit || ''}` : '–'}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {threshold != null && (
          <span className="text-[11px] text-perf-muted">阈值: {Math.round(threshold)}{unit || ''}</span>
        )}
        {delta != null && (
          <span className={`text-[11px] font-semibold ${bad ? 'text-status-regression' : 'text-status-ok'}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function RunsTable({ runs, job }: { runs: PerfRun[]; job: JobDetailResponse['job'] }) {
  // Find median run (by start_ms)
  const sortedByStart = [...runs].filter((r) => r.start_ms != null).sort((a, b) => a.start_ms! - b.start_ms!);
  const medianIdx = Math.floor(sortedByStart.length / 2);
  const medianSessionId = sortedByStart[medianIdx]?.session_id;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-semibold text-perf-text">各轮测试数据</h3>
        <span className="text-xs text-perf-muted">共 {runs.length} 轮，高亮行为中位数</span>
      </div>
      <p className="text-xs text-perf-muted mb-3">每次 CI 会重复启动 app 多轮取中位数，此表展示每轮的原始测量值，可用于判断单轮异常或数据波动。</p>
      <div className="rounded-lg overflow-hidden border border-perf-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['轮次', '启动 ms', '刷新 ms', '函数调用'].map((h) => (
                <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const isMedian = run.session_id === medianSessionId;
              const startExceeds = job.start_threshold != null && run.start_ms != null && run.start_ms > job.start_threshold;
              const spanExceeds = job.span_threshold != null && run.span_ms != null && run.span_ms > job.span_threshold;
              return (
                <tr key={i} className={`hover:bg-perf-hover transition-colors ${isMedian ? 'bg-perf-accent/5' : i % 2 !== 0 ? 'bg-perf-row-alt' : ''}`}>
                  <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text">
                    #{run.run_index ?? i + 1}
                    {isMedian && <span className="ml-1.5 text-[10px] text-perf-accent font-medium">中位数</span>}
                  </td>
                  <td className={`px-3 py-2 border-t border-perf-surface/50 font-mono ${startExceeds ? 'text-err-text font-semibold' : 'text-perf-text'}`}>
                    {run.start_ms != null ? `${Math.round(run.start_ms)}ms` : '–'}
                  </td>
                  <td className={`px-3 py-2 border-t border-perf-surface/50 font-mono ${spanExceeds ? 'text-err-text font-semibold' : 'text-perf-text'}`}>
                    {run.span_ms != null ? `${Math.round(run.span_ms)}ms` : '–'}
                  </td>
                  <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                    {run.fc_count != null ? run.fc_count : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function InsightFnTable({ fns }: { fns: InsightFunction[] }) {
  return (
    <div className="rounded-lg overflow-hidden border border-perf-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {['函数', '模块', 'p95 ms', '平均 ms', '调用次数'].map((h) => (
              <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fns.map((fn, i) => (
            <tr key={i} className={`hover:bg-perf-hover transition-colors ${i % 2 !== 0 ? 'bg-perf-row-alt' : ''}`}>
              <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono text-xs max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap" title={fn.name}>
                {fn.name}
              </td>
              <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text-dim text-xs">
                {fn.module ?? '–'}
              </td>
              <td className={`px-3 py-2 border-t border-perf-surface/50 font-mono ${fn.p95 != null && fn.p95 > 100 ? 'text-err-text font-semibold' : 'text-perf-text'}`}>
                {fn.p95 != null ? `${fn.p95}ms` : '–'}
              </td>
              <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                {fn.avg != null ? `${fn.avg}ms` : '–'}
              </td>
              <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                {fn.count ?? '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HomeRefreshSection({ homeRefresh }: { homeRefresh: NonNullable<SessionInsights['home_refresh']> }) {
  const start = homeRefresh.startSinceSessionStartMs;
  const end = homeRefresh.endSinceSessionStartMs;
  const span = homeRefresh.spanMs;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-semibold text-perf-text">Token 刷新窗口热点</h3>
        {span != null && (
          <span className="text-xs text-perf-muted">
            {start != null ? `${Math.round(start)}ms` : '?'} → {end != null ? `${Math.round(end)}ms` : '?'}（持续 {Math.round(span)}ms）
          </span>
        )}
      </div>
      <p className="text-xs text-perf-muted mb-3">刷新窗口内占用 JS 线程最多的函数，是超标原因的直接线索。</p>
      <InsightFnTable fns={homeRefresh.topFunctions} />
    </div>
  );
}

function JsBlockSection({ jsblock }: { jsblock: NonNullable<SessionInsights['jsblock']> }) {
  const maxSpan = Math.max(...jsblock.topWindows.map((w) => w.span ?? 0));
  const count = jsblock.topWindows.length;
  const sessionCount = jsblock.sessionCount ?? 1;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-semibold text-perf-text">JS 线程阻塞</h3>
        <span className="text-xs text-perf-muted">
          最长阻塞 {Math.round(maxSpan)}ms，共 {count} 次
          {sessionCount > 1 && `（${sessionCount} 轮合并）`}
        </span>
      </div>
      <p className="text-xs text-perf-muted mb-3">JS 线程被长时间占用，导致 UI 无法响应。每条展示阻塞时长和当时最慢函数。</p>
      <div className="flex flex-col gap-2">
        {jsblock.topWindows.map((w, i) => (
          <div key={i} className="bg-perf-card border border-perf-surface rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-err-text">阻塞 {w.span != null ? `${Math.round(w.span)}ms` : '?'}</span>
              {w.jsblock?.name && (
                <span className="text-[11px] text-perf-muted font-mono">{w.jsblock.name}</span>
              )}
            </div>
            {w.topFunctions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {w.topFunctions.slice(0, 3).map((f, j) => (
                  <span key={j} className="text-[11px] bg-perf-surface rounded px-1.5 py-0.5 font-mono text-perf-text-dim" title={f.name}>
                    {f.name.split('.').pop()} {f.p95 != null ? `${f.p95}ms` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RepeatedCallsSection({ calls, sessionCount }: { calls: SessionInsights['repeated_calls']; sessionCount?: number }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-semibold text-perf-text">短时重复调用</h3>
        <span className="text-xs text-perf-muted">
          100ms 内连续调用同一函数
          {sessionCount && sessionCount > 1 ? `（${sessionCount} 轮合并）` : null}
        </span>
      </div>
      <p className="text-xs text-perf-muted mb-3">可能是不必要的重复渲染或逻辑循环。调用次数越多、总耗时越高，优先级越高。</p>
      <div className="rounded-lg overflow-hidden border border-perf-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['函数', '模块', '连续调用次数', '总耗时'].map((h) => (
                <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calls.map((c, i) => (
              <tr key={i} className={`hover:bg-perf-hover transition-colors ${i % 2 !== 0 ? 'bg-perf-row-alt' : ''}`}>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono text-xs max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap" title={c.name}>
                  {c.name}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text-dim text-xs">
                  {c.module ?? '–'}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                  {c.calls != null ? `${c.calls} 次` : '–'}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                  {c.total_duration_ms != null ? `${c.total_duration_ms}ms` : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SlowFunctions({ fnStats }: { fnStats: PerfFnStat[] }) {
  const top10 = fnStats.slice(0, 10);

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-semibold text-perf-text">最慢函数 TOP 10</h3>
        <span className="text-xs text-perf-muted">全 session 聚合均值</span>
      </div>
      <p className="text-xs text-perf-muted mb-3">整个测试 session 中 p95 最高的函数，与上方"刷新窗口热点"不同，这里统计全程所有调用。</p>
      <div className="rounded-lg overflow-hidden border border-perf-surface">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider w-[40%]">函数</th>
              {['模块', 'p95 ms', '平均 ms', '调用次数'].map((h) => (
                <th key={h} className="bg-perf-surface text-perf-muted text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top10.map((fn, i) => (
              <tr key={i} className={`hover:bg-perf-hover transition-colors ${i % 2 !== 0 ? 'bg-perf-row-alt' : ''}`}>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono text-xs max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap" title={fn.fn_name}>
                  {fn.fn_name}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text-dim text-xs">
                  {fn.fn_module ?? '–'}
                </td>
                <td className={`px-3 py-2 border-t border-perf-surface/50 font-mono ${fn.avg_p95_ms != null && fn.avg_p95_ms > 100 ? 'text-err-text font-semibold' : 'text-perf-text'}`}>
                  {fn.avg_p95_ms != null ? `${fn.avg_p95_ms.toFixed(1)}ms` : '–'}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                  {fn.avg_avg_ms != null ? `${fn.avg_avg_ms.toFixed(1)}ms` : '–'}
                </td>
                <td className="px-3 py-2 border-t border-perf-surface/50 text-perf-text font-mono">
                  {fn.avg_call_count != null ? fn.avg_call_count.toFixed(0) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const KEY_MARK_PHASES: Record<string, string> = {
  // 应用启动
  'app:start': '应用启动',

  // Home 生命周期
  'Home:overview:mount': 'Home 挂载',
  'Home:overview:unmount': 'Home 卸载',
  'Home:tabs:containerKey:init': 'Tab 初始化',
  'Home:tabs:containerKey:change': 'Tab 切换',
  'Home:done:tokens': 'Home 渲染完成',

  // KPI 核心
  'Home:refresh:start:tokens': '刷新开始',
  'Home:refresh:done:tokens': '刷新完成 ✓',

  // 审批
  'Home:approvals:fetch:start': '审批拉取开始',
  'Home:approvals:fetch:done': '审批拉取完成',

  // 本地数据加载
  'Home:tokens:rawData:prefetch:start': '本地预取开始',
  'Home:tokens:rawData:prefetch:done': '本地预取完成',
  'Home:tokens:rawData:load:start': '本地数据加载开始',
  'Home:tokens:rawData:load:done': '本地数据加载完成',
  'Home:tokens:rawData:customTokens:done': '自定义 Token 完成',
  'Home:tokens:rawData:riskTokenManagement:done': '风险管理完成',
  'Home:tokens:rawData:localTokens:done': '本地 Token 完成',
  'Home:tokens:rawData:aggregateToken:done': '数据聚合完成',

  // WalletConfigSync
  'Home:tokens:walletConfigSync:start': '钱包配置同步开始',
  'Home:tokens:walletConfigSync:done': '钱包配置同步完成',

  // 全网络请求
  'Home:tokens:allnet:rawData:start': '全网络请求开始',
  'Home:tokens:allnet:rawData:done': '全网络请求完成',

  // onStarted 流水线
  'Home:tokens:onStarted:start': 'onStarted 开始',
  'Home:tokens:onStarted:rawData:start': 'onStarted 数据开始',
  'Home:tokens:onStarted:rawData:done': 'onStarted 数据完成',
  'Home:tokens:onStarted:done': 'onStarted 完成',

  // 后处理
  'Home:tokens:postFetch:start': '数据后处理开始',
  'Home:tokens:postFetch:done': '数据后处理完成',
  'Home:tokens:aggregateBuild:start': '聚合构建开始',
  'Home:tokens:aggregateBuild:done': '聚合构建完成',
  'Home:tokens:mergeAllTokens:start': 'Token 合并开始',
  'Home:tokens:mergeAllTokens:done': 'Token 合并完成',

  // BTC 新地址
  'Home:btcFreshAddress:sync:scheduled': 'BTC 新地址计划同步',
  'Home:btcFreshAddress:sync:start': 'BTC 新地址同步开始',
  'Home:btcFreshAddress:sync:done': 'BTC 新地址同步完成',

  // DeFi
  'Home:defi:allnet:fetch:start': 'DeFi 全网络拉取开始',
  'Home:defi:allnet:fetch:done': 'DeFi 全网络拉取完成',
  'Home:defi:allnet:rawData:start': 'DeFi 全网络数据开始',
  'Home:defi:allnet:rawData:done': 'DeFi 全网络数据完成',
  'Home:defi:fetch:start': 'DeFi 拉取开始',
  'Home:defi:fetch:done': 'DeFi 拉取完成',

  // Perps
  'Home:perpsConfig:update:start': 'Perps 配置更新开始',
  'Home:perpsConfig:update:done': 'Perps 配置更新完成',

  // Bootstrap
  'Bootstrap:fetchCurrencyList:start': '货币列表拉取开始',
  'Bootstrap:fetchCurrencyList:done': '货币列表拉取完成',
  'Bootstrap:marketBasicConfig:start': '市场配置开始',
  'Bootstrap:marketBasicConfig:done': '市场配置完成',
  'Bootstrap:perpsConfig:update:start': 'Perps Bootstrap 开始',
  'Bootstrap:perpsConfig:update:done': 'Perps Bootstrap 完成',
  'Bootstrap:appUpdate:autoCheck:start': 'App 更新检查开始',
  'Bootstrap:appUpdate:autoCheck:done': 'App 更新检查完成',

  // AllNet
  'AllNet:useAllNetworkRequests:start': 'AllNet 入口',
  'AllNet:getAllNetworkAccounts:prefetch:start': 'AllNet 账户预取开始',
  'AllNet:getAllNetworkAccounts:prefetch:done': 'AllNet 账户预取完成',
  'AllNet:getAllNetworkAccounts:start': 'AllNet 账户获取开始',
  'AllNet:getAllNetworkAccounts:done': 'AllNet 账户获取完成',
  'AllNet:tokens:onStarted:start': 'AllNet Token onStarted',
  'AllNet:tokens:onStarted:afterGetRawData': 'AllNet Token 数据后',
  'AllNet:tokens:onStarted:afterWalletConfigSync': 'AllNet 钱包配置后',
  'AllNet:cacheRequests:start': 'AllNet 缓存请求开始',
  'AllNet:cacheRequests:done': 'AllNet 缓存请求完成',
  'AllNet:cacheData:start': 'AllNet 缓存数据开始',
  'AllNet:cacheData:done': 'AllNet 缓存数据完成',
  'AllNet:requests:start': 'AllNet 网络请求开始',
  'AllNet:requests:done': 'AllNet 网络请求完成',
  'AllNet:request:start': 'AllNet 单次请求开始',
  'AllNet:request:done': 'AllNet 单次请求完成',
  'AllNet:request:timeout': 'AllNet 请求超时',
  'AllNet:request:lateDone': 'AllNet 请求延迟完成',
  'AllNet:indexedRequests:start': 'AllNet 索引请求开始',
  'AllNet:indexedRequests:done': 'AllNet 索引请求完成',
  'AllNet:notIndexedRequests:start': 'AllNet 非索引请求开始',
  'AllNet:notIndexedRequests:done': 'AllNet 非索引请求完成',

  // Token
  'Token:fetchAccountTokens:done': '账户 Token 拉取完成',
};

function KeyMarksSection({ keyMarks }: { keyMarks: NonNullable<KeyMarks> }) {
  const entries = Object.entries(keyMarks.marks)
    .filter(([, v]) => v != null)
    .sort(([, a], [, b]) => (a as number) - (b as number));

  if (entries.length === 0) return null;

  const max = entries[entries.length - 1][1] as number;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-semibold text-perf-text">关键时间点</h3>
        {keyMarks.sessionCount && keyMarks.sessionCount > 1 && (
          <span className="text-xs text-perf-muted">{keyMarks.sessionCount} 轮均值</span>
        )}
      </div>
      <p className="text-xs text-perf-muted mb-3">各关键里程碑相对 session 开始的时间，可用于定位刷新延迟的具体阶段。</p>
      <div className="flex flex-col gap-1">
        {entries.map(([name, ms]) => {
          const t = ms as number;
          const pct = max > 0 ? (t / max) * 100 : 0;
          const label = KEY_MARK_PHASES[name] || name.split(':').slice(-1)[0];
          const isKeyMilestone = name === 'Home:refresh:start:tokens' || name === 'Home:refresh:done:tokens';
          return (
            <div key={name} className={`flex items-center gap-2 rounded px-2 py-1 ${isKeyMilestone ? 'bg-perf-accent/5' : ''}`}>
              <div className="w-52 shrink-0 min-w-0">
                <div className={`text-[11px] truncate ${isKeyMilestone ? 'text-perf-text font-medium' : 'text-perf-muted'}`}>{label}</div>
                <div className="text-[10px] text-perf-text-faint font-mono truncate" title={name}>{name}</div>
              </div>
              <div className="flex-1 bg-perf-surface rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${isKeyMilestone ? 'bg-perf-accent' : 'bg-perf-muted/40'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className={`text-[11px] font-mono w-16 text-right shrink-0 ${isKeyMilestone ? 'text-perf-accent font-semibold' : 'text-perf-muted'}`}>
                {t}ms
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LowFpsSection({ lowFps }: { lowFps: NonNullable<LowFps> }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-semibold text-perf-text">低帧率窗口</h3>
        <span className="text-xs text-perf-muted">
          阈值 {lowFps.thresholdFps ?? 10} FPS，共 {lowFps.topWindows.length} 个卡顿窗口
          {lowFps.sessionCount && lowFps.sessionCount > 1 ? `（${lowFps.sessionCount} 轮合并）` : null}
        </span>
      </div>
      <p className="text-xs text-perf-muted mb-3">帧率低于阈值的时间窗口，及窗口内最耗时的函数，是 UI 卡顿的直接原因。</p>
      <div className="flex flex-col gap-2">
        {lowFps.topWindows.map((w, i) => (
          <div key={i} className="bg-perf-card border border-perf-surface rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              {w.fps && (
                <span className="text-xs font-semibold text-err-text">
                  {w.fps.min.toFixed(1)} FPS min / {w.fps.avg.toFixed(1)} FPS avg
                </span>
              )}
              {w.span != null && (
                <span className="text-[11px] text-perf-muted">{Math.round(w.span)}ms 窗口</span>
              )}
            </div>
            {w.topFunctions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {w.topFunctions.slice(0, 3).map((f, j) => (
                  <span key={j} className="text-[11px] bg-perf-surface rounded px-1.5 py-0.5 font-mono text-perf-text-dim" title={f.name}>
                    {f.name.split('.').pop()} {f.p95 != null ? `${f.p95}ms` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
