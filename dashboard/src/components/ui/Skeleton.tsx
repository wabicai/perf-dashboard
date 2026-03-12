export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-perf-surface ${className}`}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border border-perf-surface overflow-hidden">
      <div className="bg-perf-surface p-2">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-2 border-t border-perf-surface/50">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="w-full h-[360px] rounded-lg bg-perf-card border border-perf-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="w-48 h-4" />
        <Skeleton className="w-32 h-3" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-perf-card border border-perf-surface rounded-lg p-4 flex flex-col gap-3">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded" />
        <Skeleton className="h-5 w-12 rounded" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-12 flex-1 rounded-md" />
        <Skeleton className="h-12 flex-1 rounded-md" />
        <Skeleton className="h-12 flex-1 rounded-md" />
      </div>
    </div>
  );
}
