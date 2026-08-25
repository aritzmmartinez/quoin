import type { ExposureKind, Instrument } from "../domain";

export interface InstrumentRepository {
  upsert(instruments: readonly Instrument[]): Promise<void>;
  list(): Promise<Instrument[]>;
  get(id: string): Promise<Instrument | null>;
  setQuoteSymbol(id: string, symbol: string | null): Promise<void>;
  setTer(id: string, ter: string | null): Promise<void>;
  setHedgedToBase(id: string, hedged: boolean): Promise<void>;
  setExposure(
    id: string,
    kind: ExposureKind | null,
    leafId: string | null,
  ): Promise<void>;
}
