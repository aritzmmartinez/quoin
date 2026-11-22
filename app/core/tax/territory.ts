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

/** Everything the tax engine reads that depends on the territory, and only that. */
export interface TerritoryRules {
  readonly savingsScales: readonly SavingsBaseTaxScale[];
  readonly repurchase: readonly RepurchaseRule[];
  readonly swapValuation: readonly SwapValuationRule[];
  readonly lossCarryforwardYears: number;
  /**
   * Share of one savings pool's positive balance that the other pool's negative
   * balance may offset, as a decimal string. Zero keeps the pools apart.
   */
  readonly crossOffsetLimit: string;
  readonly unlistedNotice: UnlistedNoticeRule;
}

const TERRITORY_RULES = {
  bizkaia: {
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
    /**
     * Art. 43 NF 13/2013 de Bizkaia. Letter i is letter g's mechanics with
     * another homogeneity and another start: fungible crypto of the same type,
     * transmitted from 1 January 2025. A crypto sale before that day has no
     * rule and only its notice.
     */
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
    /** Crypto before letter i: whether a one-year repurchase rule reached those sales is unsettled. */
    unlistedNotice: { assetClass: "fungible-crypto", windowMonths: 12 },
  },
} satisfies Record<Territory, TerritoryRules>;

export function territoryRules(territory: Territory): TerritoryRules {
  return TERRITORY_RULES[territory];
}
