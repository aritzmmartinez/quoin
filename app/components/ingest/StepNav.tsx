import { Check } from "lucide-react";

import { es } from "~/lib";

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
  const copy = es.ingest;
  const current = STAGES.indexOf(stage);
  const furthest = STAGES.indexOf(reached);

  return (
    <ol className="flex items-start py-4">
      {STAGES.map((step, index) => {
        const label = copy.steps[step];
        const done = index < current;
        const available = index <= furthest && index !== current;

        return (
          <li key={step} className="flex flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <Marker
                index={index}
                done={done}
                current={index === current}
                label={label}
                onGo={available ? () => onGo(step) : null}
                disabled={disabled}
              />
              <span
                className={`text-[11px] ${
                  index <= current ? "text-text" : "text-muted"
                }`}
              >
                {label}
              </span>
            </div>

            {index < STAGES.length - 1 && (
              <span
                aria-hidden
                className={`mt-3 h-px flex-1 ${done ? "bg-text" : "bg-border"}`}
              />
            )}
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
  const shape =
    "flex size-6 items-center justify-center rounded-full border text-[11px] tabular-nums transition-colors";
  const tone = done
    ? "border-text bg-text text-bg"
    : current
      ? "border-text text-text"
      : "border-border text-muted";

  const inner = done ? (
    <Check size={13} strokeWidth={2} aria-hidden />
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
      aria-label={es.ingest.goToStep(label)}
      className={`${shape} ${tone} hover:border-text disabled:pointer-events-none disabled:opacity-30`}
    >
      {inner}
    </button>
  );
}
