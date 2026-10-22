import Decimal from "decimal.js";

import type { FxRate, FxSaveResult, FxSeries } from "../ports";

export interface FxWritePlan extends FxSaveResult {
  write: FxRate[];
}

export function planFxWrite(
  series: FxSeries,
  stored: readonly FxRate[],
  incoming: readonly FxRate[],
): FxWritePlan {
  for (const rate of incoming) {
    if (
      rate.source !== series.source ||
      rate.base !== series.base ||
      rate.quote !== series.quote
    ) {
      throw new Error(
        `Rate ${rate.source}:${rate.base}:${rate.quote} on ${rate.day} does not belong to ${series.source}:${series.base}:${series.quote}`,
      );
    }
  }

  const byDay = new Map(stored.map((rate) => [rate.day, rate]));
  const fresh = new Map<string, FxRate>();
  const conflicts: FxWritePlan["conflicts"] = [];
  let unchanged = 0;

  for (const rate of incoming) {
    const held = byDay.get(rate.day) ?? fresh.get(rate.day);
    if (!held) {
      fresh.set(rate.day, rate);
    } else if (new Decimal(held.rate).equals(rate.rate)) {
      unchanged += 1;
    } else {
      conflicts.push({ stored: held, incoming: rate });
    }
  }

  if (conflicts.length > 0) {
    return { write: [], inserted: 0, unchanged, conflicts };
  }
  const write = [...fresh.values()].sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
  );
  return { write, inserted: write.length, unchanged, conflicts };
}
