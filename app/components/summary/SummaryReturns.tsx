import type { PeriodReturns } from "~/core/projections";
import { useCopy, useFormat } from "~/lib";

import { periodReturnTile, signClass } from "../ui/signed";
import { StatTile } from "../ui/StatTile";

export interface SummaryReturnsProps {
  period: PeriodReturns;
  pricedCount: number;
  openCount: number;
  realBasis?: boolean;
}

export function SummaryReturns({
  period,
  pricedCount,
  openCount,
  realBasis = false,
}: SummaryReturnsProps) {
  const t = useCopy();
  const format = useFormat();
  const r = t.summary.returns;
  const twr = periodReturnTile(period, "twr", format, t);
  const mwr = periodReturnTile(period, "mwr", format, t);

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={r.twr}
          sub={twr.sub}
          value={twr.value}
          valueClass={signClass(twr.sign)}
        />
        <StatTile
          label={r.mwr}
          sub={mwr.sub}
          value={mwr.value}
          valueClass={signClass(mwr.sign)}
        />
      </div>
      <p className="text-[12px] leading-relaxed text-muted">
        {pricedCount < openCount && `${r.coverage(pricedCount, openCount)}. `}
        {r.note}
        {realBasis && ` ${r.nominal}`}
      </p>
    </section>
  );
}
