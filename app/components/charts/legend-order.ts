import type { LegendPayload } from "recharts";

export function legendOrder(
  keys: readonly string[],
): (item: LegendPayload) => number {
  return (item) => {
    const index = keys.indexOf(String(item.dataKey));
    return index === -1 ? keys.length : index;
  };
}
