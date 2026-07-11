/**
 * Maps instrument id (ISIN, or symbol for crypto) -> the Yahoo Finance symbol
 * used to fetch its price.
 *
 * Prefer EUR-denominated venues so quotes come back in the base currency and
 * need no FX conversion (e.g. Xetra ".DE", Amsterdam ".AS", BME ".MC"). For US
 * listings quoted in USD, either map to a EUR venue or wait for the FX step.
 *
 * Instruments missing here are skipped by the sync (and reported), so you can
 * fill this in incrementally. Kept in the adapter on purpose: the core domain
 * never sees a provider-specific symbol.
 */
export const YAHOO_SYMBOLS: Record<string, string> = {
  // Fill with your holdings. Format examples (verify each on finance.yahoo.com):
  // "IE00BK5BQT80": "VWCE.DE",     // Vanguard FTSE All-World (Xetra, EUR)
  // "IE00BK5BCH80": "RENG.DE",     // L&G Clean Energy (verify venue/ticker)
  // "IE000M7V94E1": "NUCL.DE",     // VanEck Nuclear (verify venue/ticker)
  // "BTC":          "BTC-EUR",     // Bitcoin in EUR
};
