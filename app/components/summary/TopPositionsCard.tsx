import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import { es, formatMoney, formatPercent } from "~/lib";

import { Card } from "../ui/Card";
import { SleeveChip } from "../ui/SleeveChip";
import { signClass, signedPercent } from "../ui/signed";

import type { Sleeve } from "~/core/domain";

export interface TopPositionRow {
  instrumentId: string;
  name: string;
  sleeve: Sleeve;
  marketValue: string;
  weight: string;
  unrealizedPnLPct: string | null;
}

export function TopPositionsCard({
  rows,
}: {
  rows: readonly TopPositionRow[];
}) {
  const t = es.summary.top;

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">{t.title}</h2>
        <Link
          to="/cartera"
          className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-text"
        >
          {t.link}
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">{t.empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={`${row.instrumentId}-${row.sleeve}`}>
              <Link
                to={`/instrument/${encodeURIComponent(row.instrumentId)}`}
                className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-surface-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px]">{row.name}</span>
                  <SleeveChip sleeve={row.sleeve} />
                </span>
                <span className="flex shrink-0 items-center gap-3 text-[13px] tabular-nums">
                  <span className="text-muted">
                    {formatMoney(row.marketValue)}
                  </span>
                  <span className="w-12 text-right text-muted">
                    {formatPercent(row.weight)}
                  </span>
                  <span
                    className={`w-16 text-right font-medium ${signClass(row.unrealizedPnLPct)}`}
                  >
                    {signedPercent(row.unrealizedPnLPct)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
