import { Link } from "react-router";

const RAIL =
  "inline-flex gap-0.5 rounded-md border border-border bg-surface p-1";
const SEGMENT =
  "flex h-[26px] items-center rounded-sm px-2.5 text-[12px] font-medium transition-colors";
const ACTIVE = "bg-accent text-on-accent";
const IDLE = "text-muted hover:text-text";

const PILLS = "flex flex-wrap gap-1";
const PILL =
  "flex h-8 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors";
const PILL_ACTIVE = "border-accent bg-accent text-on-accent";
const PILL_IDLE = "border-border text-muted hover:border-faint hover:text-text";

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

export function PillLinks<K extends string>({
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
    <nav aria-label={label} className={`${PILLS} ${className}`}>
      {segments.map((segment) => (
        <Link
          key={segment.key}
          to={segment.href}
          title={segment.hint}
          aria-current={segment.key === value ? "page" : undefined}
          className={`${PILL} ${segment.key === value ? PILL_ACTIVE : PILL_IDLE}`}
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
