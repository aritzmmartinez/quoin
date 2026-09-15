import { useCopy, useFormat } from "~/lib";

import { signClass, signedPercent } from "../ui/signed";
import { StatTile } from "../ui/StatTile";

export interface SummaryReturnsProps {
  twr: string | null;
  mwr: string | null;
  realBasis?: boolean;
}

export function SummaryReturns({
  twr,
  mwr,
  realBasis = false,
}: SummaryReturnsProps) {
  const t = useCopy();
  const { formatPercent } = useFormat();
  const r = t.summary.returns;

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={r.twr.label}
          sub={twr === null ? r.unavailable : r.twr.sub}
          value={signedPercent(formatPercent, twr)}
          valueClass={signClass(twr)}
        />
        <StatTile
          label={r.mwr.label}
          sub={mwr === null ? r.unavailable : r.mwr.sub}
          value={signedPercent(formatPercent, mwr)}
          valueClass={signClass(mwr)}
        />
      </div>
      <p className="text-[12px] leading-relaxed text-muted">
        {r.note}
        {realBasis && ` ${r.nominal}`}
      </p>
    </section>
  );
}
