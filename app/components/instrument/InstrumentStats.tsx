import type { PeriodReturns } from "~/core/projections";
import { useCopy, useFormat } from "~/lib";

import { Card } from "../ui/Card";
import { periodReturnTile, signClass } from "../ui/signed";

export interface InstrumentKpis {
  period: PeriodReturns;
  openCost: string;
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
  const format = useFormat();
  const { formatMoney } = format;
  const t = useCopy();
  const k = t.instrument.kpis;
  const twr = periodReturnTile(kpis.period, "twr", format, t);
  const mwr = periodReturnTile(kpis.period, "mwr", format, t);
  return (
    <Card className="mb-6">
      <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <Tile
          label={k.twr}
          sub={twr.sub}
          value={twr.value}
          valueClass={signClass(twr.sign)}
        />
        <Tile
          label={k.mwr}
          sub={mwr.sub}
          value={mwr.value}
          valueClass={signClass(mwr.sign)}
        />
        <Tile
          label={k.openCost.label}
          sub={k.openCost.sub}
          value={formatMoney(kpis.openCost)}
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
