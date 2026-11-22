import { describe, expect, it } from "vitest";

import { territoryRules } from "./territory";

describe("territoryRules", () => {
  it("pins every Bizkaia value, so a change to one is deliberate", () => {
    expect(territoryRules("bizkaia")).toEqual({
      savingsScales: [
        {
          year: 2026,
          source:
            "Art. 76 NF 13/2013 de Bizkaia, redacción NF 2/2025, efectos 1-1-2026",
          brackets: [
            { from: "0", to: "7500", rate: "0.19" },
            { from: "7500", to: "15000", rate: "0.20" },
            { from: "15000", to: "30000", rate: "0.22" },
            { from: "30000", to: "50000", rate: "0.24" },
            { from: "50000", to: "90000", rate: "0.255" },
            { from: "90000", to: "120000", rate: "0.26" },
            { from: "120000", to: "240000", rate: "0.265" },
            { from: "240000", to: "300000", rate: "0.27" },
            { from: "300000", to: null, rate: "0.28" },
          ],
        },
      ],
      repurchase: [
        {
          letter: "g",
          assetClass: "listed-security",
          windowMonths: 2,
          homogeneity: "instrument",
          acquisitions: "all",
          from: null,
          to: null,
          source: "Art. 43.g NF 13/2013 de Bizkaia",
        },
        {
          letter: "i",
          assetClass: "fungible-crypto",
          windowMonths: 2,
          homogeneity: "instrument",
          acquisitions: "all",
          from: "2025-01-01",
          to: null,
          source:
            "Art. 43.i NF 13/2013, redacción de la NF 6/2025, de 12 de diciembre (BOB 15/12/2025)",
        },
      ],
      swapValuation: [
        {
          from: null,
          to: null,
          source:
            "Arts. 47.1.i, 45.1 y 45.3 NF 13/2013 de Bizkaia; Art. 47.1.p, redacción de la NF 6/2025",
        },
      ],
      lossCarryforwardYears: 4,
      unlistedNotice: { assetClass: "fungible-crypto", windowMonths: 12 },
    });
  });
});
