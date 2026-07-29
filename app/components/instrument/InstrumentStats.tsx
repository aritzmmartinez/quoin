import { es, formatMoney } from "~/lib";

import { Card } from "../ui/Card";
import { signClass, signedPercent } from "../ui/signed";

export interface InstrumentKpis {
  twr: string | null;
  mwr: string | null;
  totalInvested: string;
  buyCount: number;
  avgBuyAmount: string;
}

function Tile({
  label,
  sub,
  value,
  valueClass = "",
}: {
  label: string;
  sub: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div
        className={`mt-1 text-[18px] font-semibold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{sub}</div>
    </div>
  );
}

export function InstrumentStats({ kpis }: { kpis: InstrumentKpis }) {
  const k = es.instrument.kpis;
  return (
    <Card className="mb-6">
      <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        <Tile
          label={k.twr.label}
          sub={k.twr.sub}
          value={signedPercent(kpis.twr)}
          valueClass={signClass(kpis.twr)}
        />
        <Tile
          label={k.mwr.label}
          sub={k.mwr.sub}
          value={signedPercent(kpis.mwr)}
          valueClass={signClass(kpis.mwr)}
        />
        <Tile
          label={k.totalInvested.label}
          sub={k.totalInvested.sub}
          value={formatMoney(kpis.totalInvested)}
        />
        <Tile
          label={k.buyCount.label}
          sub={k.buyCount.sub}
          value={String(kpis.buyCount)}
        />
        <Tile
          label={k.avgBuyAmount.label}
          sub={k.avgBuyAmount.sub}
          value={formatMoney(kpis.avgBuyAmount)}
        />
      </div>
    </Card>
  );
}
