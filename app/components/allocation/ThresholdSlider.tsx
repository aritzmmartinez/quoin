import Decimal from "decimal.js";
import { useState } from "react";
import { useSearchParams } from "react-router";

import {
  CONCENTRATION_THRESHOLD,
  es,
  formatPercent,
  THRESHOLD_MAX_PERCENT,
  THRESHOLD_MIN_PERCENT,
  THRESHOLD_PARAM,
  thresholdPercent,
} from "~/lib";

export function ThresholdSlider({ threshold }: { threshold: string }) {
  const copy = es.allocation;
  const [, setParams] = useSearchParams();
  const [percent, setPercent] = useState(() => thresholdPercent(threshold));

  function commit(value: number) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (new Decimal(value).div(100).eq(CONCENTRATION_THRESHOLD)) {
          next.delete(THRESHOLD_PARAM);
        } else {
          next.set(THRESHOLD_PARAM, String(value));
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return (
    <label className="flex items-center gap-2 text-[11.5px] text-muted">
      <span className="tabular-nums">
        {copy.thresholdMark(
          formatPercent(new Decimal(percent).div(100).toString(), 0),
        )}
      </span>
      <input
        type="range"
        min={THRESHOLD_MIN_PERCENT}
        max={THRESHOLD_MAX_PERCENT}
        step={1}
        value={percent}
        aria-label={copy.thresholdLabel}
        onChange={(event) => setPercent(Number(event.currentTarget.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
        className="h-1 w-24 cursor-pointer accent-text"
      />
    </label>
  );
}
