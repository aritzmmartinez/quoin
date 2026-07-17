import type { ExposureKind, Instrument } from "~/core/domain";
import type { InstrumentRepository } from "~/core/ports";

import { prisma } from "./db.server";
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
    await prisma.instrument.update({
      where: { id },
      data: { quoteSymbol: symbol },
    });
  }

  async setExposure(
    id: string,
    kind: ExposureKind | null,
    leafId: string | null,
  ): Promise<void> {
    await prisma.instrument.update({
      where: { id },
      data: { exposureKind: kind, exposureLeafId: leafId },
    });
  }
}
