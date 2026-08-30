import { useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  es,
  formatMoney,
  formatPercent,
  isConcentrated,
  type ExposureRow,
} from "~/lib";

import { MeterBar } from "../ui/MeterBar";

const GRID = "grid-cols-[minmax(120px,180px)_minmax(0,1fr)_74px]";

export function ExposureBars({
  rows,
  threshold,
}: {
  rows: ExposureRow[];
  threshold: string;
}) {
  const copy = es.allocation;

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-muted">{copy.empty}</p>
    );
  }

  const peak = rows.reduce((max, r) => Math.max(max, Number(r.weight ?? 0)), 0);
  const scaleMax = Math.max(peak, Number(threshold)) * 1.15;

  return (
    <div>
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          scaleMax={scaleMax}
          threshold={threshold}
        />
      ))}
    </div>
  );
}

function Row({
  row,
  scaleMax,
  threshold,
}: {
  row: ExposureRow;
  scaleMax: number;
  threshold: string;
}) {
  const copy = es.allocation;
  const [open, setOpen] = useState(false);

  const hot = isConcentrated(row.weight, threshold);
  const expandable = row.contributions.length > 1;
  const pct = (v: string): number =>
    scaleMax === 0 ? 0 : (Number(v) / scaleMax) * 100;

  const direct = pct(row.direct);
  const via = pct(row.via);

  const sub =
    row.kind === "UNRESOLVED"
      ? copy.kinds.UNRESOLVED
      : Number(row.direct) > 0 && Number(row.via) > 0
        ? copy.splitBoth(
            formatPercent(row.direct, 2, { floorNonZero: true }),
            formatPercent(row.via, 2, { floorNonZero: true }),
          )
        : Number(row.direct) > 0
          ? copy.splitDirect
          : copy.splitVia;

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className={`grid ${GRID} items-center gap-3.5 py-row ${expandable ? "cursor-pointer" : ""}`}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
      >
        <div className="flex min-w-0 items-center gap-1">
          {expandable ? (
            <ChevronDown
              size={12}
              strokeWidth={1.75}
              aria-hidden
              className={`shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
            />
          ) : (
            <span className="w-3 shrink-0" aria-hidden />
          )}
          <div className="min-w-0">
            <div
              className={`truncate text-[13px] font-medium ${row.kind === "UNRESOLVED" ? "text-muted" : ""}`}
            >
              {row.name}
            </div>
            <div className="truncate text-[10.5px] text-muted">{sub}</div>
          </div>
        </div>

        <MeterBar
          segments={[
            {
              width: direct,
              color: hot ? "var(--color-negative)" : "var(--color-text)",
            },
            {
              width: via,
              color: hot ? "var(--color-negative)" : "var(--color-dn-3)",
              opacity: hot ? 0.45 : 1,
            },
          ]}
          marker={(Number(threshold) / scaleMax) * 100}
        />

        <div className="text-right">
          <div
            className={`text-[13px] tabular-nums ${hot ? "font-medium text-negative" : ""}`}
          >
            {row.weight === null
              ? "—"
              : formatPercent(row.weight, 2, { floorNonZero: true })}
          </div>
          <div className="text-[10.5px] tabular-nums text-muted">
            {formatMoney(row.value)}
          </div>
        </div>
      </div>

      {open && (
        <ul className="pb-2 pl-4">
          {row.contributions.map((c) => (
            <li
              key={`${c.instrumentId}-${c.weightInParent ?? "direct"}`}
              className="flex items-center gap-3 py-0.5 text-[11.5px] text-muted"
            >
              <span className="min-w-0 flex-1 truncate">
                {c.instrumentName}
              </span>
              <span className="shrink-0">
                {c.weightInParent === null
                  ? copy.direct
                  : copy.insideFund(
                      formatPercent(c.weightInParent, 2, {
                        floorNonZero: true,
                      }),
                    )}
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums">
                {formatMoney(c.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
