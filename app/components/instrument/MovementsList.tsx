import { DASH, es, formatDate, formatMoney, formatQuantity } from "~/lib";

import { Card } from "../ui/Card";

export interface Movement {
  t: number;
  side: "BUY" | "SELL";
  quantity: string;
  price: string;
  amount: string;
}

export function MovementsList({ movements }: { movements: Movement[] }) {
  const m = es.instrument.movements;
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pb-3 pt-4 text-[14px] font-semibold">{m.title}</div>
      {movements.length === 0 ? (
        <p className="px-5 pb-6 text-[13px] text-muted">{m.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-130">
            <div className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_1fr] gap-2 border-y border-border px-5 py-2 text-[11px] font-medium text-muted">
              <span>{m.columns.date}</span>
              <span>{m.columns.side}</span>
              <span className="text-right">{m.columns.quantity}</span>
              <span className="text-right">{m.columns.price}</span>
              <span className="text-right">{m.columns.amount}</span>
            </div>
            <ul>
              {movements.map((mv, i) => (
                <li
                  key={`${mv.t}-${i}`}
                  className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_1fr] gap-2 border-b border-border px-5 py-2.5 text-[13px] tabular-nums last:border-b-0"
                >
                  <span>{formatDate(new Date(mv.t).toISOString())}</span>
                  <span
                    className={
                      mv.side === "BUY" ? "text-positive" : "text-negative"
                    }
                  >
                    {mv.side === "BUY" ? m.buy : m.sell}
                  </span>
                  <span className="text-right">
                    {formatQuantity(mv.quantity)}
                  </span>
                  <span className="text-right">
                    {Number(mv.price) > 0 ? formatMoney(mv.price) : DASH}
                  </span>
                  <span className="text-right font-medium">
                    {formatMoney(mv.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
