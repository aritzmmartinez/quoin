import { useCopy } from "~/lib";

import { Button } from "../ui/Button";

export function StepperNav({
  onPrevious,
  onNext,
  nextLabel,
  canGoBack,
  canGoNext,
  disabled,
}: {
  onPrevious: () => void;
  onNext: () => void;
  nextLabel: string;
  canGoBack: boolean;
  canGoNext: boolean;
  disabled: boolean;
}) {
  const t = useCopy();
  return (
    <div className="mt-6 flex items-center justify-between gap-2 border-t border-border pt-4">
      <Button
        variant="ghost"
        onClick={onPrevious}
        disabled={!canGoBack || disabled}
      >
        {t.ingest.previous}
      </Button>
      <Button onClick={onNext} disabled={!canGoNext || disabled}>
        {nextLabel}
      </Button>
    </div>
  );
}
