interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-perf-muted uppercase tracking-wider">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-perf-surface border border-perf-border rounded-lg text-perf-text px-2.5 py-1.5 text-[13px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-perf-accent/50 focus-visible:border-perf-accent/60 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
