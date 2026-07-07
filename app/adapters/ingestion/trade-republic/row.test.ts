import { describe, it, expect } from "vitest";
import { parseTradeRepublicCsv } from "./row";

const HEADER =
  "datetime,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,transaction_id,mcc_code";

describe("parseTradeRepublicCsv", () => {
  it("parses quoted fields containing commas and strips unknown columns", () => {
    const csv = [
      HEADER,
      `"2025-01-02T10:00:00.000Z","TRADING","BUY","FUND","Vanguard FTSE All-World, USD Acc","IE00BK5BQT80","1","100","-100","","","EUR","tx-1","5411"`,
    ].join("\n");

    const rows = parseTradeRepublicCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Vanguard FTSE All-World, USD Acc");
    expect(rows[0]!.symbol).toBe("IE00BK5BQT80");
    expect("mcc_code" in rows[0]!).toBe(false);
  });

  it("skips empty lines", () => {
    const csv = `${HEADER}\n\n`;
    expect(parseTradeRepublicCsv(csv)).toHaveLength(0);
  });
});
