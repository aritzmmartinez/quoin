import { DASH, es, formatMoney, formatPercent } from "~/lib";

import { Card } from "../ui/Card";

export interface InstrumentKpis {
  twr: string | null;
  mwr: string | null;
  totalInvested: string;
  buyCount: number;
  avgBuyAmount: string;
}

function pctClass(fraction: string | null): string {
  if (fraction === null) return "";
  const n = Number(fraction);
  return n > 0 ? "text-positive" : n < 0 ? "text-negative" : "";
}

function signedPct(fraction: string | null): string {
  if (fraction === null) return DASH;
  const n = Number(fraction);
  const body = formatPercent(String(Math.abs(n)));
  return n < 0 ? `\u2212${body}` : n > 0 ? `+${body}` : body;
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
          value={signedPct(kpis.twr)}
          valueClass={pctClass(kpis.twr)}
        />
        <Tile
          label={k.mwr.label}
          sub={k.mwr.sub}
          value={signedPct(kpis.mwr)}
          valueClass={pctClass(kpis.mwr)}
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
