import type { FundOverlapPair } from "~/core/projections";
import { es, formatPercent } from "~/lib";

import { Card } from "../ui/Card";
import { MeterBar } from "../ui/MeterBar";
import type { OverlapFund } from "./OverlapPanel";

const SHOWN = 3;

export function OverlapList({
  funds,
  pairs,
}: {
  funds: readonly OverlapFund[];
  pairs: readonly FundOverlapPair[];
}) {
  const copy = es.overlap;
  const nameOf = new Map(funds.map((fund) => [fund.id, fund.name]));

  const peak = pairs.reduce(
    (max, pair) => Math.max(max, Number(pair.overlap)),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      {pairs.map((pair) => (
        <Card key={`${pair.a}|${pair.b}`} className="min-w-0 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0 text-[13px] font-medium">
              {copy.contributorPair(
                nameOf.get(pair.a) ?? pair.a,
                nameOf.get(pair.b) ?? pair.b,
              )}
            </div>
            <div className="text-[18px] font-semibold tabular-nums tracking-tight">
              {formatPercent(pair.overlap, 1, { floorNonZero: true })}
            </div>
          </div>

          <div className="mt-2.5">
            <MeterBar
              className="h-2.5"
              segments={[
                {
                  width: peak === 0 ? 0 : (Number(pair.overlap) / peak) * 100,
                  color: "var(--color-text)",
                },
              ]}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11.5px] text-muted">
            <span>
              {pair.shared === 0 ? copy.none : copy.shared(pair.shared)}
            </span>
            {pair.contributors.length > 0 && (
              <span className="min-w-0 truncate">
                {copy.top}:{" "}
                {pair.contributors
                  .slice(0, SHOWN)
                  .map(
                    (contributor) =>
                      `${contributor.name} ${formatPercent(contributor.weight, 1, { floorNonZero: true })}`,
                  )
                  .join(" · ")}
              </span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
