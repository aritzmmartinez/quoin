import { useState } from "react";

import { es, filterByRange, type Range } from "~/lib";

import {
  InvestedVsValueChart,
  type InvestedVsValueDatum,
} from "../charts/InvestedVsValueChart";
import { Card } from "../ui/Card";
import { RangeSelector } from "../ui/RangeSelector";

export type { InvestedVsValueDatum };

export function InvestedVsValue({ data }: { data: InvestedVsValueDatum[] }) {
  const [range, setRange] = useState<Range>("all");
  const c = es.instrument.ivvChart;
  const view = filterByRange(data, range);

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold">{c.title}</h2>
        <RangeSelector value={range} onChange={setRange} />
      </div>
      {data.length < 2 ? (
        <p className="py-10 text-center text-[13px] text-muted">{c.building}</p>
      ) : (
        <InvestedVsValueChart
          data={view}
          labels={{ value: c.value, invested: c.invested }}
        />
      )}
    </Card>
  );
}
