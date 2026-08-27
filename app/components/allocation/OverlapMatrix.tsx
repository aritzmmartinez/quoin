import type { FundOverlapPair } from "~/core/projections";
import { es, formatPercent } from "~/lib";

import { Card } from "../ui/Card";
import type { OverlapFund } from "./OverlapPanel";

const MAX_INK = 0.18;

export function OverlapMatrix({
  funds,
  pairs,
}: {
  funds: readonly OverlapFund[];
  pairs: readonly FundOverlapPair[];
}) {
  const copy = es.overlap;

  const byPair = new Map<string, string>();
  for (const pair of pairs) {
    byPair.set(`${pair.a}|${pair.b}`, pair.overlap);
    byPair.set(`${pair.b}|${pair.a}`, pair.overlap);
  }

  const peak = pairs.reduce(
    (max, pair) => Math.max(max, Number(pair.overlap)),
    0,
  );

  return (
    <Card className="min-w-0 p-6">
      <p className="mb-4 text-[12.5px] text-muted">{copy.matrixHeader}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-130 border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="w-[38%] px-2 py-2 text-left font-medium text-muted">
                &nbsp;
              </th>
              {funds.map((fund, index) => (
                <th
                  key={fund.id}
                  scope="col"
                  title={fund.name}
                  className="px-2 py-2 text-right font-medium tabular-nums text-muted"
                >
                  {index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {funds.map((row, rowIndex) => (
              <tr key={row.id} className="border-t border-border">
                <th
                  scope="row"
                  className="max-w-0 truncate px-2 py-2 text-left font-medium"
                  title={row.name}
                >
                  <span className="tabular-nums text-muted px-2">
                    {rowIndex + 1}
                  </span>{" "}
                  {row.name}
                </th>

                {funds.map((column) => {
                  const overlap =
                    row.id === column.id
                      ? null
                      : (byPair.get(`${row.id}|${column.id}`) ?? null);

                  return (
                    <td
                      key={column.id}
                      className="relative px-2 py-2 text-right tabular-nums"
                    >
                      {overlap !== null && peak > 0 && (
                        <span
                          aria-hidden
                          className="absolute inset-y-px inset-x-0.5 rounded-sm"
                          style={{
                            background: "var(--color-text)",
                            opacity: (Number(overlap) / peak) * MAX_INK,
                          }}
                        />
                      )}
                      <span
                        className={`relative ${overlap === null ? "text-muted" : ""}`}
                      >
                        {overlap === null
                          ? "—"
                          : formatPercent(overlap, 1, { floorNonZero: true })}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11.5px] leading-normal text-muted">
        {copy.matrixLegend}
      </p>
    </Card>
  );
}
