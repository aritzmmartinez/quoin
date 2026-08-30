import type { CurrencyExposure } from "~/core/projections";
import { es, formatMoney, formatPercent } from "~/lib";

import { Card } from "../ui/Card";
import { MeterBar } from "../ui/MeterBar";
import { StatTile } from "../ui/StatTile";

const GRID = "grid-cols-[minmax(64px,88px)_minmax(0,1fr)_74px]";

export function CurrencyPanel({
  exposure,
  hedgedCount,
}: {
  exposure: CurrencyExposure;
  hedgedCount: number;
}) {
  const copy = es.currency;

  if (exposure.buckets.length === 0) {
    return (
      <Card className="p-6">
        <p className="py-10 text-center text-[13px] text-muted">{copy.empty}</p>
      </Card>
    );
  }

  const share = (value: string): string =>
    Number(exposure.total) === 0
      ? "0"
      : String(Number(value) / Number(exposure.total));

  const peak = exposure.buckets.reduce(
    (max, bucket) => Math.max(max, Math.abs(Number(bucket.weight ?? 0))),
    0,
  );
  const scaleMax = peak * 1.15;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={copy.stats.base}
          value={formatPercent(share(exposure.base), 1)}
          sub={formatMoney(exposure.base)}
        />
        <StatTile
          label={copy.stats.foreign}
          value={formatPercent(share(exposure.foreign), 1)}
          sub={formatMoney(exposure.foreign)}
        />
        <StatTile
          label={copy.stats.unresolved}
          value={formatPercent(share(exposure.unresolved), 1)}
          sub={formatMoney(exposure.unresolved)}
        />
      </div>

      <Card className="min-w-0 p-6">
        <h2 className="mb-1 text-[14px] font-semibold">{copy.title}</h2>
        <p className="mb-4 text-[12.5px] leading-normal text-muted">
          {copy.intro}
        </p>

        <div>
          {exposure.buckets.map((bucket) => (
            <div
              key={bucket.currency ?? "unresolved"}
              className={`grid ${GRID} items-center gap-3.5 border-b border-border py-row last:border-b-0`}
            >
              <div
                className={`truncate text-[13px] font-medium ${bucket.currency === null ? "text-muted" : "tabular-nums"}`}
              >
                {bucket.currency ?? copy.unresolvedLabel}
              </div>

              <MeterBar
                segments={[
                  {
                    width:
                      scaleMax === 0
                        ? 0
                        : (Math.abs(Number(bucket.weight ?? 0)) / scaleMax) *
                          100,
                    color:
                      bucket.currency === null
                        ? "var(--color-dn-4)"
                        : "var(--color-text)",
                  },
                ]}
              />

              <div className="text-right">
                <div className="text-[13px] tabular-nums">
                  {bucket.weight === null
                    ? "—"
                    : formatPercent(bucket.weight, 2, { floorNonZero: true })}
                </div>
                <div className="text-[10.5px] tabular-nums text-muted">
                  {formatMoney(bucket.value)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {hedgedCount > 0 && (
          <p className="mt-4 text-[11.5px] leading-normal text-muted">
            {copy.hedged(hedgedCount)}
          </p>
        )}

        {Number(exposure.unresolved) !== 0 && (
          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-[12px] font-medium text-muted">
              {copy.unresolvedTitle}
            </summary>
            <p className="mt-2 text-[11.5px] leading-normal text-muted">
              {copy.unresolvedBody}
            </p>
            <p className="mt-2 text-[11.5px] leading-normal text-muted">
              {copy.unresolvedFix}
            </p>
          </details>
        )}
      </Card>
    </div>
  );
}
