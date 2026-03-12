export function Chip({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span className={`bg-perf-surface border border-perf-border rounded-md px-1.5 py-0.5 text-[11px] text-perf-text-dim ${mono ? 'font-mono' : ''}`}>
      {children}
    </span>
  );
}
