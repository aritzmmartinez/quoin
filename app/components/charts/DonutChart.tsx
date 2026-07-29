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

const SIZE = 120;
const STROKE = 16;
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
        {slices.map((slice, index) => {
          const fraction = Number(slice.weight);
          const dash = fraction * CIRCUMFERENCE;
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
          offset += dash;
          return circle;
        })}
      </g>
    </svg>
  );
}
