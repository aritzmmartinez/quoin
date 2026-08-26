/**
 * Bloomberg composite exchange code to ISO 4217, for the currency a listing
 * does business in.
 *
 * DELIBERATELY NOT `BLOOMBERG_EXCHANGE` INVERTED, even though the codes overlap
 * almost entirely. That table exists to narrow an already-ambiguous candidate
 * set, which is why its own comment says a wrong or missing entry costs
 * nothing: the filter matches nothing and the caller falls through. Here a
 * wrong entry costs a wrong currency on screen with nothing to catch it. Same
 * codes, opposite risk, so: separate table, own test, `null` on anything
 * unlisted.
 *
 */
const CURRENCY_BY_EXCHANGE: Record<string, string> = {
  US: "USD",
  CT: "CAD",
  LN: "GBP",
  GR: "EUR",
  FP: "EUR",
  SM: "EUR",
  IM: "EUR", // Italy — not IT
  NA: "EUR",
  BB: "EUR",
  PL: "EUR",
  AV: "EUR",
  ID: "EUR", // Ireland — not Indonesia
  GA: "EUR",
  FH: "EUR",
  SW: "CHF",
  SS: "SEK",
  NO: "NOK",
  DC: "DKK",
  JT: "JPY",
  HK: "HKD",
  TT: "TWD",
  KS: "KRW",
  SP: "SGD",
  AU: "AUD",
  NZ: "NZD",
  IN: "INR",
  CH: "CNY", // China — Switzerland is SW
  TB: "THB",
  MK: "MYR",
  IJ: "IDR", // Indonesia — not ID
  PM: "PHP",
  BZ: "BRL",
  MM: "MXN",
  SJ: "ZAR",
  TI: "TRY",
  PW: "PLN",
  IT: "ILS", // Israel — not Italy
  HB: "HUF",
  CP: "CZK",
  DU: "AED",
  AB: "SAR",
  QD: "QAR",
  CI: "CLP",
  CX: "COP",
  PE: "PEN",
};

/**
 * The ISO 4217 codes this table knows about, derived rather than restated so a
 * currency added above cannot go missing here.
 */
export const KNOWN_CURRENCIES: ReadonlySet<string> = new Set(
  Object.values(CURRENCY_BY_EXCHANGE),
);

/** ISO 4217 of a Bloomberg composite exchange code, or null if unlisted. */
export function bloombergCurrency(exchCode: string | null): string | null {
  if (!exchCode) return null;
  return CURRENCY_BY_EXCHANGE[exchCode.toUpperCase()] ?? null;
}
