import { type Range, RANGE_KEYS, useCopy } from "~/lib";

import { SegmentedButtons } from "./Segmented";

export function RangeSelector({
  value,
  onChange,
  className = "",
}: {
  value: Range;
  onChange: (range: Range) => void;
  className?: string;
}) {
  const t = useCopy();
  const labels: Record<Range, string> = {
    "1m": t.range.m1,
    "6m": t.range.m6,
    "1y": t.range.y1,
    all: t.range.all,
  };
  return (
    <SegmentedButtons
      label={t.range.label}
      value={value}
      onSelect={onChange}
      className={`font-mono ${className}`}
      segments={RANGE_KEYS.map((key) => ({ key, label: labels[key] }))}
    />
  );
}
