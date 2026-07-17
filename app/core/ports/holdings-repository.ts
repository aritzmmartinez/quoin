export interface EtfHolding {
  instrumentId: string;
  /** ISIN when the issuer publishes one, otherwise its ticker. */
  identity: string;
  identityKind: "ISIN" | "TICKER";
  name: string;
  /** Fraction of the fund, as a decimal string. */
  weight: string;
  asOf: Date;
}

export interface HoldingsRepository {
  /**
   * Replace a fund's composition wholesale. A holdings file is a snapshot, not
   * an event: appending would keep constituents that have left the index.
   */
  replaceFor(instrumentId: string, holdings: readonly EtfHolding[]): Promise<number>;
  all(): Promise<Map<string, EtfHolding[]>>;
  forInstrument(instrumentId: string): Promise<EtfHolding[]>;
  deleteForInstrument(instrumentId: string): Promise<number>;
}
