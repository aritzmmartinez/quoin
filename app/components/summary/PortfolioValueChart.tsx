import { useCopy } from "~/lib";

import {
  InvestedVsValueChart,
  type InvestedVsValueDatum,
} from "../charts/InvestedVsValueChart";
import { usePendingRefresh } from "../charts/use-pending";
import { Card } from "../ui/Card";

export function PortfolioValueChart({
  data,
}: {
  data: readonly InvestedVsValueDatum[];
}) {
  const t = useCopy();
  const c = t.summary.chart;
  const busy = usePendingRefresh();
  return (
    <Card className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="text-[14px] font-semibold">{c.title}</h2>
      <div
        aria-busy={busy}
        className={`transition-opacity ${busy ? "opacity-60" : ""}`}
      >
        {data.length < 2 ? (
          <p className="py-10 text-center text-[13px] text-muted">
            {c.building}
          </p>
        ) : (
          <InvestedVsValueChart
            data={data}
            height={240}
            labels={{ value: c.value, invested: c.invested }}
          />
        )}
      </div>
    </Card>
  );
}
