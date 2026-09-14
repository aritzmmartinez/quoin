export interface DonutSlice {
  weight: string;
}

export const DONUT_COLORS = [
  "var(--color-dn-1)",
  "var(--color-dn-2)",
  "var(--color-dn-3)",
  "var(--color-dn-4)",
  "var(--color-dn-5)",
] as const;

export function donutColor(index: number): string {
  return DONUT_COLORS[index % DONUT_COLORS.length]!;
}

const SIZE = 124;
const STROKE = 12;
const GAP = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  slices,
  label,
}: {
  slices: readonly DonutSlice[];
  label: string;
}) {
  let offset = 0;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-border-subtle)"
          strokeWidth={STROKE}
        />
        {slices.map((slice, index) => {
          const fraction = Number(slice.weight);
          const dash = Math.max(fraction * CIRCUMFERENCE - GAP, 0);
          const circle = (
            <circle
              key={index}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={donutColor(index)}
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash + GAP;
          return circle;
        })}
      </g>
    </svg>
  );
}
