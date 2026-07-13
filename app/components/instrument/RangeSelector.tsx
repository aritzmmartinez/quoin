import { es } from "~/lib";

export type Range = "1m" | "6m" | "1y" | "all";

export const RANGE_DAYS: Record<Range, number | null> = {
  "1m": 30,
  "6m": 182,
  "1y": 365,
  all: null,
};

const OPTIONS: { key: Range; label: string }[] = [
  { key: "1m", label: es.instrument.range.m1 },
  { key: "6m", label: es.instrument.range.m6 },
  { key: "1y", label: es.instrument.range.y1 },
  { key: "all", label: es.instrument.range.all },
];

export function filterByRange<T extends { t: number }>(
  data: T[],
  range: Range,
): T[] {
  const days = RANGE_DAYS[range];
  if (days === null) return data;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return data.filter((d) => d.t >= cutoff);
}

export function RangeSelector({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
            value === o.key
              ? "bg-surface-2 text-text"
              : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
