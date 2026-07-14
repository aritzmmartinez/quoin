import { useEffect, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { es, formatDate, formatMoney } from "~/lib";

import { Card } from "../ui/Card";
import { filterByRange, RangeSelector, type Range } from "./RangeSelector";

export interface PriceChartDatum {
  t: number;
  price: number | null;
  avgCost: number | null;
  buy: number | null;
  sell: number | null;
}

const axisDate = (t: number) =>
  new Intl.DateTimeFormat("es-ES", { month: "short", year: "2-digit" }).format(
    new Date(t),
  );
const axisEur = (v: number) => formatMoney(String(v), 0);
const TOOLTIP_STYLE = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
} as const;

export function PriceChartWithTrades({ data }: { data: PriceChartDatum[] }) {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<Range>("all");
  useEffect(() => setMounted(true), []);

  const c = es.instrument.priceChart;
  const view = filterByRange(data, range);
  const hasPrice = data.some((d) => d.price !== null);

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold">{c.title}</h2>
        <RangeSelector value={range} onChange={setRange} />
      </div>
      {!hasPrice && <p className="mb-2 text-[12px] text-muted">{c.noPrice}</p>}
      {data.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted">{c.empty}</p>
      ) : !mounted ? (
        <div style={{ height: 280 }} />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={view}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          >
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={axisDate}
              stroke="var(--color-muted)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              tickFormatter={axisEur}
              stroke="var(--color-muted)"
              fontSize={11}
              width={64}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(t) =>
                formatDate(new Date(t as number).toISOString())
              }
              formatter={(value, name) => [formatMoney(String(value)), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              name={c.price}
              dataKey="price"
              type="monotone"
              stroke="var(--color-text)"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              name={c.avgCost}
              dataKey="avgCost"
              type="stepAfter"
              stroke="var(--color-muted)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Scatter
              name={c.buy}
              dataKey="buy"
              fill="var(--color-positive)"
              isAnimationActive={false}
            />
            <Scatter
              name={c.sell}
              dataKey="sell"
              fill="var(--color-negative)"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
