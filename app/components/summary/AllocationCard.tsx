import { es, formatMoney, formatPercent } from "~/lib";

import { DonutChart, donutColor } from "../charts/DonutChart";
import { Card } from "../ui/Card";

export interface AllocationRow {
  category: string;
  label: string;
  value: string;
  weight: string;
}

export function AllocationCard({ rows }: { rows: readonly AllocationRow[] }) {
  const a = es.summary.allocation;

  return (
    <Card className="flex flex-col p-4 md:p-6">
      <h2 className="mb-4 text-[14px] font-semibold">{a.title}</h2>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">{a.empty}</p>
      ) : (
        <div className="flex flex-1 flex-wrap items-center gap-8">
          <DonutChart slices={rows} label={a.title} />
          <ul className="min-w-0 flex-1 space-y-2">
            {rows.map((row, index) => (
              <li
                key={row.category}
                className="flex items-center justify-between gap-3 text-[13px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: donutColor(index) }}
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 tabular-nums">
                  <span className="text-muted">{formatMoney(row.value)}</span>
                  <span className="font-medium">
                    {formatPercent(row.weight)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
