export interface MeterSegment {
  width: number;
  color: string;
  opacity?: number;
}

export function MeterBar({
  segments,
  marker = null,
  className = "h-4",
  label,
}: {
  segments: readonly MeterSegment[];
  marker?: number | null;
  className?: string;
  label?: string;
}) {
  let offset = 0;

  return (
    <div
      className={`relative overflow-hidden rounded bg-surface-2 ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {segments.map((segment, index) => {
        const left = offset;
        offset += segment.width;
        return (
          <span
            key={index}
            className="absolute inset-y-0"
            style={{
              left: `${left}%`,
              width: `${segment.width}%`,
              background: segment.color,
              opacity: segment.opacity,
            }}
          />
        );
      })}

      {marker !== null && (
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-muted"
          style={{ left: `${marker}%`, opacity: 0.6 }}
        />
      )}
    </div>
  );
}
