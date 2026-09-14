import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import { es, formatMoney, formatPercent } from "~/lib";

import { Card } from "../ui/Card";
import { ThesisChip } from "../ui/ThesisChip";
import { signClass, signedPercent } from "../ui/signed";
import { TABLE_DIVIDER } from "../ui/table";

import type { Thesis } from "~/core/domain";

export interface TopPositionRow {
  instrumentId: string;
  name: string;
  thesis: Thesis;
  marketValue: string;
  weight: string;
  unrealizedPnLPct: string | null;
}

const ROW_COLUMNS = "minmax(0, 1fr) auto 56px 64px";

export function TopPositionsCard({
  rows,
}: {
  rows: readonly TopPositionRow[];
}) {
  const t = es.summary.top;

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">{t.title}</h2>
        <Link
          to="/cartera"
          className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-muted transition-colors hover:text-text"
        >
          {t.link}
          <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">{t.empty}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.instrumentId} className={TABLE_DIVIDER}>
              <Link
                to={`/instrument/${encodeURIComponent(row.instrumentId)}`}
                className="-mx-2 grid h-11 items-center gap-4 rounded-md px-2 transition-colors hover:bg-surface-2"
                style={{ gridTemplateColumns: ROW_COLUMNS }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-medium">
                    {row.name}
                  </span>
                  <ThesisChip thesis={row.thesis} />
                </span>
                <span className="font-mono text-[12px] text-muted">
                  {formatMoney(row.marketValue)}
                </span>
                <span className="text-right font-mono text-[12px] text-muted">
                  {formatPercent(row.weight)}
                </span>
                <span
                  className={`text-right font-mono text-[12px] font-semibold ${signClass(row.unrealizedPnLPct)}`}
                >
                  {signedPercent(row.unrealizedPnLPct)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
