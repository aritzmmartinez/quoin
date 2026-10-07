import { useState } from "react";

import { type Range, rangedSeries, useCopy } from "~/lib";

import {
  InvestedVsValueChart,
  type InvestedVsValueDatum,
} from "../charts/InvestedVsValueChart";
import { Card } from "../ui/Card";
import { RangeSelector } from "../ui/RangeSelector";

export type { InvestedVsValueDatum };

export function InstrumentValueChart({
  data,
}: {
  data: InvestedVsValueDatum[];
}) {
  const t = useCopy();
  const [range, setRange] = useState<Range>("all");
  const c = t.instrument.ivvChart;
  const series = rangedSeries(data, range, 2);

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold">{c.title}</h2>
        <RangeSelector value={range} onChange={setRange} />
      </div>
      {series.kind === "empty" ? (
        <p className="py-10 text-center text-[13px] text-muted">{c.building}</p>
      ) : series.kind === "outOfRange" ? (
        <p className="py-10 text-center text-[13px] text-muted">
          {t.range.empty}
        </p>
      ) : (
        <InvestedVsValueChart
          data={series.points}
          labels={{ value: c.value, invested: c.invested }}
        />
      )}
    </Card>
  );
}
