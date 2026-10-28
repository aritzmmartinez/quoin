import type { ExposureKind, Instrument, Thesis } from "~/core/domain";
import type { InstrumentRepository } from "~/core/ports";

import { prisma } from "./db.server";
import type { Prisma } from "./generated/client";
import { stamp } from "./hlc";
import { instrumentToWriteData, rowToInstrument } from "./mappers";

export class PrismaInstrumentRepository implements InstrumentRepository {
  async upsert(instruments: readonly Instrument[]): Promise<void> {
    if (instruments.length === 0) return;
    await prisma.$transaction(
      instruments.map((instrument) => {
        const data = instrumentToWriteData(instrument);
        return prisma.instrument.upsert({
          where: { id: instrument.id },
          create: data,
          update: data,
        });
      }),
    );
  }

  async list(): Promise<Instrument[]> {
    const rows = await prisma.instrument.findMany({ orderBy: { id: "asc" } });
    return rows.map(rowToInstrument);
  }

  async get(id: string): Promise<Instrument | null> {
    const row = await prisma.instrument.findUnique({ where: { id } });
    return row ? rowToInstrument(row) : null;
  }

  async setQuoteSymbol(id: string, symbol: string | null): Promise<void> {
    await this.setStamped(
      id,
      (row) => row.quoteSymbol === symbol,
      (hlc) => ({ quoteSymbol: symbol, quoteSymbolHlc: hlc }),
    );
  }

  async setTer(id: string, ter: string | null): Promise<void> {
    await this.setStamped(
      id,
      (row) => row.ter === ter,
      (hlc) => ({ ter, terHlc: hlc }),
    );
  }

  async setHedgedToBase(id: string, hedged: boolean): Promise<void> {
    await this.setStamped(
      id,
      (row) => row.hedgedToBase === hedged,
      (hlc) => ({ hedgedToBase: hedged, hedgedToBaseHlc: hlc }),
    );
  }

  async setThesis(id: string, thesis: Thesis): Promise<void> {
    await this.setStamped(
      id,
      (row) => row.thesis === thesis,
      (hlc) => ({ thesis, thesisHlc: hlc }),
    );
  }

  async setExposure(
    id: string,
    kind: ExposureKind | null,
    leafId: string | null,
  ): Promise<void> {
    await this.setStamped(
      id,
      (row) => row.exposureKind === kind && row.exposureLeafId === leafId,
      (hlc) => ({ exposureKind: kind, exposureLeafId: leafId, exposureHlc: hlc }),
    );
  }

  // A save that changes nothing issues no mark: the instruments screen calls
  // every setter on every save, and a mark is a claim that the value changed.
  private async setStamped(
    id: string,
    unchanged: (row: Prisma.InstrumentModel) => boolean,
    data: (hlc: string) => Prisma.InstrumentUpdateInput,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.instrument.findUniqueOrThrow({ where: { id } });
      if (unchanged(row)) return;
      await tx.instrument.update({ where: { id }, data: data(await stamp(tx)) });
    });
  }
}
