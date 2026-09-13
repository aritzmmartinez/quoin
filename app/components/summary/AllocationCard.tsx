import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import { es, formatMoney, formatPercent } from "~/lib";

import { DonutChart, donutColor } from "../charts/DonutChart";
import { Card } from "../ui/Card";
import { TABLE_DIVIDER } from "../ui/table";

export interface AllocationRow {
  category: string;
  label: string;
  value: string;
  weight: string;
}

export function AllocationCard({ rows }: { rows: readonly AllocationRow[] }) {
  const a = es.summary.allocation;

  return (
    <Card className="flex min-w-0 flex-col justify-between gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">{a.title}</h2>
        <Link
          to="/asignacion"
          className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-muted transition-colors hover:text-text"
        >
          {a.link}
          <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">{a.empty}</p>
      ) : (
        <div className="flex flex-1 flex-wrap items-center gap-8">
          <DonutChart slices={rows} label={a.title} />
          <ul className="min-w-0 flex-1 basis-55">
            {rows.map((row, index) => (
              <li
                key={row.category}
                className={`${TABLE_DIVIDER} grid h-9 items-center gap-3`}
                style={{
                  gridTemplateColumns: "8px minmax(0, 1fr) auto 56px",
                }}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-xs"
                  style={{ background: donutColor(index) }}
                />
                <span className="truncate text-[13px] font-medium">
                  {row.label}
                </span>
                <span className="font-mono text-[12px] text-muted">
                  {formatMoney(row.value)}
                </span>
                <span className="text-right font-mono text-[13px] font-semibold">
                  {formatPercent(row.weight)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
