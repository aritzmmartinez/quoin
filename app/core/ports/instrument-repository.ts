import type { ExposureKind, Instrument } from "../domain";

export interface InstrumentRepository {
  upsert(instruments: readonly Instrument[]): Promise<void>;
  list(): Promise<Instrument[]>;
  get(id: string): Promise<Instrument | null>;
  setQuoteSymbol(id: string, symbol: string | null): Promise<void>;
  setExposure(
    id: string,
    kind: ExposureKind | null,
    leafId: string | null,
  ): Promise<void>;
}
