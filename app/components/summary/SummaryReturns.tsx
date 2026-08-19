import { es } from "~/lib";

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
  const r = es.summary.returns;

  return (
    <section className="mb-6">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
      >
        <StatTile
          label={r.twr.label}
          sub={twr === null ? r.unavailable : r.twr.sub}
          value={signedPercent(twr)}
          valueClass={signClass(twr)}
        />
        <StatTile
          label={r.mwr.label}
          sub={mwr === null ? r.unavailable : r.mwr.sub}
          value={signedPercent(mwr)}
          valueClass={signClass(mwr)}
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {r.note}
        {realBasis && ` ${r.nominal}`}
      </p>
    </section>
  );
}
