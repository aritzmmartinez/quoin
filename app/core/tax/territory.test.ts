import { describe, expect, it } from "vitest";

import { territoryRules } from "./territory";

describe("territoryRules", () => {
  it("pins every Bizkaia value, so a change to one is deliberate", () => {
    expect(territoryRules("bizkaia")).toEqual({
      citations: {
        repurchase: "Art. 43 NF 13/2013",
        incomeCarryforward: "Art. 66.1.a NF 13/2013",
        gainsCarryforward: "Art. 66.1.b NF 13/2013",
      },
      savingsScales: [
        {
          year: 2025,
          source:
            "Art. 76 NF 13/2013 de Bizkaia, redacción anterior a la NF 2/2025, vigente hasta 31-12-2025",
          brackets: [
            { from: "0", to: "2500", rate: "0.20" },
            { from: "2500", to: "10000", rate: "0.21" },
            { from: "10000", to: "15000", rate: "0.22" },
            { from: "15000", to: "30000", rate: "0.23" },
            { from: "30000", to: null, rate: "0.25" },
          ],
        },
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
          assetClass: "listed-security",
          windowMonths: 2,
          homogeneity: "instrument",
          acquisitions: "all",
          from: null,
          to: null,
          source: "Art. 43.g NF 13/2013 de Bizkaia",
        },
        {
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
      crossOffsetLimit: "0",
      dividendExemption: {
        limit: "1500",
        excludesCollectiveInvestment: true,
        source: "Art. 9.24 NF 13/2013 de Bizkaia",
      },
      unlistedNotice: { assetClass: "fungible-crypto", windowMonths: 12 },
    });
  });

  it("pins every régimen común value, so a change to one is deliberate", () => {
    expect(territoryRules("comun")).toEqual({
      citations: {
        repurchase: "art. 33.5 LIRPF",
        incomeCarryforward: "art. 49.1.a LIRPF",
        gainsCarryforward: "art. 49.1.b LIRPF",
      },
      savingsScales: [
        {
          year: 2025,
          source:
            "Arts. 66.1 y 76 Ley 35/2006 del IRPF, redacción de la Ley 7/2024, efectos 1-1-2025",
          brackets: [
            { from: "0", to: "6000", rate: "0.19" },
            { from: "6000", to: "50000", rate: "0.21" },
            { from: "50000", to: "200000", rate: "0.23" },
            { from: "200000", to: "300000", rate: "0.27" },
            { from: "300000", to: null, rate: "0.30" },
          ],
        },
      ],
      repurchase: [
        {
          assetClass: "listed-security",
          windowMonths: 2,
          homogeneity: "instrument",
          acquisitions: "all",
          from: null,
          to: null,
          source: "Art. 33.5.f Ley 35/2006 del IRPF",
        },
      ],
      swapValuation: [
        {
          from: null,
          to: null,
          source: "Art. 37.1.h Ley 35/2006 del IRPF; DGT V0999-18",
        },
      ],
      lossCarryforwardYears: 4,
      crossOffsetLimit: "0.25",
      dividendExemption: null,
      unlistedNotice: { assetClass: "fungible-crypto", windowMonths: 12 },
    });
  });
});
