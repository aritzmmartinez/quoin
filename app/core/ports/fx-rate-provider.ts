import type { FxRate } from "./fx-repository";

export class FxRatesUnavailableError extends Error {
  constructor(
    readonly quote: string,
    readonly status: number | null,
    options?: { cause?: unknown },
  ) {
    super(
      status === null
        ? `Exchange rates unavailable for ${quote}`
        : `Exchange rates unavailable for ${quote} (HTTP ${status})`,
      options,
    );
    this.name = "FxRatesUnavailableError";
  }
}

export interface FxRateProvider {
  readonly source: string;
  readonly base: string;
  getRates(quote: string, from: string, to: string): Promise<FxRate[]>;
}
