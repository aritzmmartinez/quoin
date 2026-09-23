import Decimal from "decimal.js";
import { useState } from "react";

import {
  THRESHOLD_COOKIE,
  THRESHOLD_MAX_PERCENT,
  THRESHOLD_MIN_PERCENT,
  thresholdPercent,
  useCopy,
  useFormat,
  writePreferenceCookie,
} from "~/lib";

import { Stepper } from "./Stepper";

/**
 * Written from the client with no revalidation, like the theme: nothing on
 * `/settings` is computed from it, and `/allocation` reads the cookie in its
 * own loader on the next visit.
 */
export function ThresholdSetting({ threshold }: { threshold: string }) {
  const t = useCopy();
  const copy = t.settings.portfolio.threshold;
  const { formatPercent } = useFormat();
  const [percent, setPercent] = useState(() => thresholdPercent(threshold));

  function select(next: number) {
    writePreferenceCookie(THRESHOLD_COOKIE, String(next));
    setPercent(next);
  }

  return (
    <Stepper
      value={percent}
      min={THRESHOLD_MIN_PERCENT}
      max={THRESHOLD_MAX_PERCENT}
      onChange={select}
      format={(value) => formatPercent(new Decimal(value).div(100).toString(), 0)}
      label={copy.label}
      decreaseLabel={copy.decrease}
      increaseLabel={copy.increase}
    />
  );
}
