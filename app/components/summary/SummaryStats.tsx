import { es, formatMoney, formatSignedMoney } from "~/lib";

import { signClass } from "../ui/signed";
import { StatTile } from "../ui/StatTile";

export interface SummaryStatsProps {
  totalInvested: string;
  unrealizedPnL: string;
  realizedPnL: string;
  positionCount: number;
}

export function SummaryStats({
  totalInvested,
  unrealizedPnL,
  realizedPnL,
  positionCount,
}: SummaryStatsProps) {
  const s = es.summary.stats;
  return (
    <div
      className="mb-6 grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
    >
      <StatTile
        label={s.invested.label}
        sub={s.invested.sub}
        value={formatMoney(totalInvested)}
      />
      <StatTile
        label={s.unrealized.label}
        sub={s.unrealized.sub}
        value={formatSignedMoney(unrealizedPnL).text}
        valueClass={signClass(unrealizedPnL)}
      />
      <StatTile
        label={s.realized.label}
        sub={s.realized.sub}
        value={formatSignedMoney(realizedPnL).text}
        valueClass={signClass(realizedPnL)}
        to="/realizado"
      />
      <StatTile
        label={s.positions.label}
        sub={s.positions.sub}
        value={String(positionCount)}
      />
    </div>
  );
}
