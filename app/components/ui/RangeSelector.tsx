import { es, RANGE_KEYS, type Range } from "~/lib";

const LABELS: Record<Range, string> = {
  "1m": es.range.m1,
  "6m": es.range.m6,
  "1y": es.range.y1,
  all: es.range.all,
};

export function RangeSelector({
  value,
  onChange,
  className = "",
}: {
  value: Range;
  onChange: (range: Range) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={es.range.label}
      className={`inline-flex rounded-lg border border-border p-0.5 ${className}`}
    >
      {RANGE_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
            value === key
              ? "bg-surface-2 text-text"
              : "text-muted hover:text-text"
          }`}
        >
          {LABELS[key]}
        </button>
      ))}
    </div>
  );
}
