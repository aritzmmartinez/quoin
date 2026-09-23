import type { LegendPayload } from "recharts";
import { describe, expect, it } from "vitest";

import { legendOrder } from "./legend-order";

const item = (dataKey: string): LegendPayload => ({ dataKey, value: dataKey });

describe("legendOrder", () => {
  it("ranks each key by its position in the list, not by its label", () => {
    const sort = legendOrder(["value", "invested"]);
    expect(sort(item("value"))).toBe(0);
    expect(sort(item("invested"))).toBe(1);
  });

  it("puts an unlisted key after every listed one", () => {
    const sort = legendOrder(["price", "avgCost"]);
    expect(sort(item("other"))).toBe(2);
  });
});
