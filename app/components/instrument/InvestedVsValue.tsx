import { useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { es, formatDate, formatMoney } from "~/lib";

import { Card } from "../ui/Card";
import { filterByRange, RangeSelector, type Range } from "./RangeSelector";

export interface InvestedVsValueDatum {
  t: number;
  invested: number;
  value: number;
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

export function InvestedVsValue({ data }: { data: InvestedVsValueDatum[] }) {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<Range>("all");
  useEffect(() => setMounted(true), []);

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
      ) : !mounted ? (
        <div style={{ height: 280 }} />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={view}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          >
            <defs>
              <linearGradient id="ivvValueFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-positive)"
                  stopOpacity={0.2}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-positive)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
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
            <Area
              name={c.value}
              dataKey="value"
              type="monotone"
              stroke="var(--color-positive)"
              strokeWidth={1.5}
              fill="url(#ivvValueFill)"
              isAnimationActive={false}
            />
            <Line
              name={c.invested}
              dataKey="invested"
              type="stepAfter"
              stroke="var(--color-muted)"
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
