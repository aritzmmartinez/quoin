import { useCopy } from "~/lib";

const GRID_LINES = 4;
const X_TICKS = 5;

export function ChartSkeleton({ height }: { height: number }) {
  const t = useCopy();
  return (
    <div role="status" aria-busy="true" style={{ height }}>
      <span className="sr-only">{t.chart.loading}</span>
      <div
        aria-hidden
        className="flex h-full flex-col gap-3 motion-safe:animate-pulse"
      >
        <div className="flex min-h-0 flex-1 gap-2">
          <div className="flex w-16 flex-col justify-between py-1">
            {Array.from({ length: GRID_LINES }, (_, i) => (
              <span key={i} className="h-2 w-10 rounded-xs bg-surface-2" />
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-between">
            {Array.from({ length: GRID_LINES }, (_, i) => (
              <span
                key={i}
                className="border-t border-dashed border-border-subtle"
              />
            ))}
          </div>
        </div>
        <div className="flex justify-between pl-16">
          {Array.from({ length: X_TICKS }, (_, i) => (
            <span key={i} className="h-2 w-8 rounded-xs bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
