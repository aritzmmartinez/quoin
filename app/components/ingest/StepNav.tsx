import { Check } from "lucide-react";

import { useCopy } from "~/lib";

export const STAGES = ["file", "mapping", "prices", "done"] as const;

export type Stage = (typeof STAGES)[number];

export function StepNav({
  stage,
  reached,
  onGo,
  disabled,
}: {
  stage: Stage;
  reached: Stage;
  onGo: (stage: Stage) => void;
  disabled: boolean;
}) {
  const t = useCopy();
  const copy = t.ingest;
  const current = STAGES.indexOf(stage);
  const furthest = STAGES.indexOf(reached);

  return (
    <ol className="flex items-start py-4">
      {STAGES.map((step, index) => {
        const label = copy.steps[step];
        const done = index < current;
        const available = index <= furthest && index !== current;

        return (
          <li
            key={step}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-2"
          >
            {index < STAGES.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-3.25 h-px ${
                  done ? "bg-accent/40" : "bg-border"
                }`}
              />
            )}

            <Marker
              index={index}
              done={done}
              current={index === current}
              label={label}
              onGo={available ? () => onGo(step) : null}
              disabled={disabled}
            />
            <span
              className={`whitespace-nowrap text-[11px] font-medium leading-none ${
                index === current ? "text-text" : "text-muted"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Marker({
  index,
  done,
  current,
  label,
  onGo,
  disabled,
}: {
  index: number;
  done: boolean;
  current: boolean;
  label: string;
  onGo: (() => void) | null;
  disabled: boolean;
}) {
  const t = useCopy();
  const shape =
    "flex size-[26px] items-center justify-center rounded-full border font-mono text-[11px] font-semibold leading-none transition-colors";
  const tone = current
    ? "border-accent bg-accent text-on-accent"
    : done
      ? "border-accent bg-accent/15 text-accent"
      : "border-border text-muted";

  const inner = done ? (
    <Check size={12} strokeWidth={1.8} aria-hidden />
  ) : (
    index + 1
  );

  if (onGo === null) {
    return (
      <span
        aria-current={current ? "step" : undefined}
        className={`${shape} ${tone}`}
      >
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onGo}
      aria-label={t.ingest.goToStep(label)}
      className={`${shape} ${tone} hover:border-accent disabled:pointer-events-none disabled:opacity-30`}
    >
      {inner}
    </button>
  );
}
