const STEP =
  "flex size-8 items-center justify-center text-muted transition-colors enabled:hover:text-text disabled:opacity-40";

export function Stepper({
  value,
  min,
  max,
  onChange,
  format,
  label,
  decreaseLabel,
  increaseLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-8 items-center overflow-hidden rounded-md border border-border bg-bg"
    >
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={STEP}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M3 7h8" />
        </svg>
      </button>
      <output
        aria-live="polite"
        className="flex h-full min-w-14 items-center justify-center border-x border-border font-mono text-[12px] font-medium"
      >
        {format(value)}
      </output>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={STEP}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M3 7h8M7 3v8" />
        </svg>
      </button>
    </div>
  );
}
