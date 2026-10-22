export class InflationUnavailableError extends Error {
  constructor(
    readonly series: string,
    readonly status: number | null,
    options?: { cause?: unknown },
  ) {
    super(
      status === null
        ? `Inflation index unavailable for ${series}`
        : `Inflation index unavailable for ${series} (HTTP ${status})`,
      options,
    );
    this.name = "InflationUnavailableError";
  }
}
