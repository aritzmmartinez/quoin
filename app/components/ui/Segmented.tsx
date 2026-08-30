import { Link } from "react-router";

const RAIL = "inline-flex rounded-lg border border-border p-0.5";
const SEGMENT =
  "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors";
const ACTIVE = "bg-surface-2 text-text";
const IDLE = "text-muted hover:text-text";

export interface Segment<K extends string> {
  key: K;
  label: string;
  hint?: string;
}

export interface LinkSegment<K extends string> extends Segment<K> {
  href: string;
}

export function SegmentedLinks<K extends string>({
  label,
  segments,
  value,
  className = "",
}: {
  label: string;
  segments: readonly LinkSegment<K>[];
  value: K;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`${RAIL} ${className}`}>
      {segments.map((segment) => (
        <Link
          key={segment.key}
          to={segment.href}
          title={segment.hint}
          aria-current={segment.key === value ? "page" : undefined}
          className={`${SEGMENT} ${segment.key === value ? ACTIVE : IDLE}`}
        >
          {segment.label}
        </Link>
      ))}
    </nav>
  );
}

export function SegmentedButtons<K extends string>({
  label,
  segments,
  value,
  onSelect,
  className = "",
}: {
  label: string;
  segments: readonly Segment<K>[];
  value: K;
  onSelect: (key: K) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`${RAIL} ${className}`}>
      {segments.map((segment) => (
        <button
          key={segment.key}
          type="button"
          onClick={() => onSelect(segment.key)}
          title={segment.hint}
          aria-pressed={segment.key === value}
          className={`${SEGMENT} ${segment.key === value ? ACTIVE : IDLE}`}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
