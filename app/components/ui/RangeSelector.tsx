import { es, RANGE_KEYS, type Range } from "~/lib";

import { SegmentedButtons } from "./Segmented";

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
    <SegmentedButtons
      label={es.range.label}
      value={value}
      onSelect={onChange}
      className={className}
      segments={RANGE_KEYS.map((key) => ({ key, label: LABELS[key] }))}
    />
  );
}
