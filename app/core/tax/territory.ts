import type {
  RepurchaseAssetClass,
  RepurchaseRule,
  SavingsBaseTaxScale,
  SwapValuationRule,
  Territory,
} from "./config";

/**
 * A sale of `assetClass` that no repurchase rule covers, at a loss, followed by
 * a purchase of the same asset within `windowMonths`, is pointed out.
 * Informative only: it changes no figure.
 */
export interface UnlistedNoticeRule {
  readonly assetClass: RepurchaseAssetClass;
  readonly windowMonths: number;
}

/**
 * Dividends exempt up to `limit` euros a year. With `excludesCollectiveInvestment`,
 * those of a fund or ETF are never exempt.
 */
export interface DividendExemptionRule {
  readonly limit: string;
  readonly excludesCollectiveInvestment: boolean;
  readonly source: string;
}

/** Where a territory's rules are written, for the screens and the scripts that cite them. */
export interface TerritoryCitations {
  readonly repurchase: string;
  readonly incomeCarryforward: string;
  readonly gainsCarryforward: string;
}

/** Everything the tax engine reads that depends on the territory, and only that. */
export interface TerritoryRules {
  readonly citations: TerritoryCitations;
  readonly savingsScales: readonly SavingsBaseTaxScale[];
  readonly repurchase: readonly RepurchaseRule[];
  readonly swapValuation: readonly SwapValuationRule[];
  readonly lossCarryforwardYears: number;
  /**
   * Share of one savings pool's positive balance that the other pool's negative
   * balance may offset, as a decimal string. Zero keeps the pools apart.
   */
  readonly crossOffsetLimit: string;
  readonly dividendExemption: DividendExemptionRule | null;
  readonly unlistedNotice: UnlistedNoticeRule;
}

const TERRITORY_RULES = {
  bizkaia: {
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
    /**
     * Art. 43 NF 13/2013 de Bizkaia. Letter i is letter g's mechanics with
     * another homogeneity and another start: fungible crypto of the same type,
     * transmitted from 1 January 2025. A crypto sale before that day has no
     * rule and only its notice.
     */
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
    /**
     * NF 13/2013, consolidated at 01/01/2026, as given by Aritz: the value of
     * what is delivered is the greater of its market value and the gross value
     * of what is received (Art. 47.1.i, which NF 6/2025 does not modify and
     * which predates 2025), and that same value is the acquisition value of
     * what is received (Art. 45.1.a, real amount). Art. 47.1.p, introduced by
     * NF 6/2025 with effect from 1 January 2025 (Disposición Final Segunda,
     * Primero.Dos), values crypto-assets at market value, or the agreed price
     * if higher. The norm does not say "the greater" of the two legs in so
     * many words; it is a reasoned criterion, chosen so that one gain is not
     * taxed twice, and `swapPairValue` carries the reasoning.
     */
    swapValuation: [
      {
        from: null,
        to: null,
        source:
          "Arts. 47.1.i, 45.1 y 45.3 NF 13/2013 de Bizkaia; Art. 47.1.p, redacción de la NF 6/2025",
      },
    ],
    /** Art. 66 NF 13/2013 de Bizkaia — integración y compensación de rentas en la base imponible del ahorro (límite de cuatro años). */
    lossCarryforwardYears: 4,
    /** Art. 66.1 NF 13/2013 de Bizkaia: income and gains compensate only within their own pool. */
    crossOffsetLimit: "0",
    /**
     * Art. 9.24 NF 13/2013 de Bizkaia, over Art. 34.a and b. The exemption does
     * not reach shares bought in the two months before the payment when
     * homogeneous ones are sold in the two after; that is not applied.
     */
    dividendExemption: {
      limit: "1500",
      excludesCollectiveInvestment: true,
      source: "Art. 9.24 NF 13/2013 de Bizkaia",
    },
    /** Crypto before letter i: whether a one-year repurchase rule reached those sales is unsettled. */
    unlistedNotice: { assetClass: "fungible-crypto", windowMonths: 12 },
  },
  comun: {
    citations: {
      repurchase: "art. 33.5 LIRPF",
      incomeCarryforward: "art. 49.1.a LIRPF",
      gainsCarryforward: "art. 49.1.b LIRPF",
    },
    /**
     * Arts. 66.1 (state) and 76 (regional) LIRPF add up to one scale, the same
     * in every autonomous community. Ley 7/2024 added the 30% bracket from
     * 2025; no earlier scale is on file.
     */
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
    /**
     * Art. 33.5.f: two months for securities admitted to trading on a
     * regulated EEA market or an equivalent one (the US included, DGT
     * V0778-25). Letter g gives one year to those not admitted; Quoin does not
     * know the market a security trades on, so stocks and ETFs take letter f.
     * Crypto has no repurchase rule.
     */
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
    /** Art. 37.1.h LIRPF: a swap is valued at the greater of the two, DGT V0999-18. */
    swapValuation: [
      {
        from: null,
        to: null,
        source: "Art. 37.1.h Ley 35/2006 del IRPF; DGT V0999-18",
      },
    ],
    /** Art. 49.1.a and b LIRPF. */
    lossCarryforwardYears: 4,
    /** Art. 49.1.a and b LIRPF: up to 25% of the other pool's positive balance. */
    crossOffsetLimit: "0.25",
    dividendExemption: null,
    /** Whether art. 33.5.e reaches crypto rebought within a year is unsettled by the DGT. */
    unlistedNotice: { assetClass: "fungible-crypto", windowMonths: 12 },
  },
} satisfies Record<Territory, TerritoryRules>;

export function territoryRules(territory: Territory): TerritoryRules {
  return TERRITORY_RULES[territory];
}
