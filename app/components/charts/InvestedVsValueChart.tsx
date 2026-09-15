import { useEffect, useMemo, useState } from "react";
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

import { useFormat } from "~/lib";

import { timeTicks } from "./time-ticks";

export interface InvestedVsValueDatum {
  t: number;
  invested: number;
  value: number;
}

const TOOLTIP_STYLE = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.28)",
  fontSize: 12,
  padding: "8px 10px",
} as const;

const TOOLTIP_LABEL_STYLE = {
  color: "var(--color-muted)",
  fontSize: 11,
  marginBottom: 4,
} as const;

const TOOLTIP_ITEM_STYLE = { padding: 0 } as const;

const CURSOR = {
  stroke: "var(--color-border)",
  strokeWidth: 1,
  strokeDasharray: "3 3",
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
  const { formatMoney, formatDate, formatTimeTick } = useFormat();
  const axisEur = (v: number) => formatMoney(String(v), 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [gradientId] = useState(() => `ivvValueFill-${(gradientSeq += 1)}`);

  const { unit, ticks } = useMemo(
    () => timeTicks(data[0]?.t ?? 0, data[data.length - 1]?.t ?? 0),
    [data],
  );

  if (!mounted) return <div style={{ height }} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={[...data]}
        margin={{ top: 0, right: 8, bottom: 0, left: 8 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-accent)"
              stopOpacity={0.28}
            />
            <stop
              offset="100%"
              stopColor="var(--color-accent)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="var(--color-border)"
          strokeDasharray="3 5"
          vertical={false}
        />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tickFormatter={(t: number, index: number) =>
            formatTimeTick(t, unit, index === 0 || new Date(t).getMonth() === 0)
          }
          stroke="var(--color-faint)"
          fontSize={11}
          fontFamily="var(--font-mono)"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={axisEur}
          stroke="var(--color-faint)"
          fontSize={11}
          fontFamily="var(--font-mono)"
          width={64}
          tickCount={5}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          domain={["auto", "auto"]}
        />
        <Tooltip
          cursor={CURSOR}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          labelFormatter={(t) =>
            formatDate(new Date(t as number).toISOString())
          }
          formatter={(value, name) => [formatMoney(String(value)), name]}
        />
        <Legend
          verticalAlign="top"
          align="left"
          height={48}
          iconType="plainline"
          iconSize={14}
          wrapperStyle={{ fontSize: 12, color: "var(--color-muted)" }}
        />
        <Area
          name={labels.value}
          dataKey="value"
          type="linear"
          stroke="var(--color-accent)"
          strokeWidth={1.75}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
        <Line
          name={labels.invested}
          dataKey="invested"
          type="stepAfter"
          stroke="var(--color-muted)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
