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

import { formatDate, formatMoney } from "~/lib";

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

let gradientSeq = 0;

export function InvestedVsValueChart({
  data,
  labels,
  height = 280,
}: {
  data: readonly InvestedVsValueDatum[];
  labels: { value: string; invested: string };
  height?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [gradientId] = useState(() => `ivvValueFill-${(gradientSeq += 1)}`);

  if (!mounted) return <div style={{ height }} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={[...data]}
        margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
          name={labels.value}
          dataKey="value"
          type="monotone"
          stroke="var(--color-positive)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
        <Line
          name={labels.invested}
          dataKey="invested"
          type="stepAfter"
          stroke="var(--color-muted)"
          strokeWidth={1.25}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
