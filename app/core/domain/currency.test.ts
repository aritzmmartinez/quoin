import { describe, it, expect } from "vitest";

import { currencyCodeSchema } from "./currency";

describe("currencyCodeSchema", () => {
  it.each(["EUR", "USD", "GBP", "USDG", "USDC", "XAU"])(
    "accepts %s",
    (code) => {
      expect(currencyCodeSchema.parse(code)).toBe(code);
    },
  );

  it.each(["", "EU", "eur", "GBp", "ZAc", "EUR ", "US-D", "ABCDEFGHIJK"])(
    "refuses %j",
    (code) => {
      expect(currencyCodeSchema.safeParse(code).success).toBe(false);
    },
  );
});
