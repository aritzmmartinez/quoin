import type { PriceRepository, PriceSnapshot } from "~/core/ports";

import { prisma } from "./db.server";

export class PrismaPriceRepository implements PriceRepository {
  async saveMany(snapshots: readonly PriceSnapshot[]): Promise<number> {
    if (snapshots.length === 0) return 0;
    await prisma.$transaction(
      snapshots.map((s) =>
        prisma.priceSnapshot.upsert({
          where: {
            instrumentId_asOf: { instrumentId: s.instrumentId, asOf: s.asOf },
          },
          create: {
            instrumentId: s.instrumentId,
            price: s.price,
            currency: s.currency,
            asOf: s.asOf,
            source: s.source,
          },
          update: { price: s.price, currency: s.currency, source: s.source },
        }),
      ),
    );
    return snapshots.length;
  }

  async latest(): Promise<Map<string, PriceSnapshot>> {
    const rows = await prisma.priceSnapshot.findMany({
      orderBy: [{ instrumentId: "asc" }, { asOf: "desc" }],
    });

    const latest = new Map<string, PriceSnapshot>();
    for (const r of rows) {
      if (latest.has(r.instrumentId)) continue;
      latest.set(r.instrumentId, {
        instrumentId: r.instrumentId,
        price: r.price,
        currency: r.currency,
        asOf: r.asOf,
        source: r.source,
      });
    }
    return latest;
  }

  async deleteForInstrument(instrumentId: string): Promise<number> {
    const { count } = await prisma.priceSnapshot.deleteMany({
      where: { instrumentId },
    });
    return count;
  }

  async historyFor(instrumentId: string): Promise<PriceSnapshot[]> {
    const rows = await prisma.priceSnapshot.findMany({
      where: { instrumentId },
      orderBy: { asOf: "asc" },
    });
    return rows.map((r) => ({
      instrumentId: r.instrumentId,
      price: r.price,
      currency: r.currency,
      asOf: r.asOf,
      source: r.source,
    }));
  }

  /**
   * First close on file per instrument, in one currency. Instruments with no
   * close in that currency are absent. One grouped query, so a screen can say
   * which instruments have history without loading every candle of each.
   */
  async historyStarts(currency: string): Promise<Map<string, Date>> {
    const rows = await prisma.priceSnapshot.groupBy({
      by: ["instrumentId"],
      where: { currency },
      _min: { asOf: true },
    });
    const starts = new Map<string, Date>();
    for (const row of rows) {
      if (row._min.asOf) starts.set(row.instrumentId, row._min.asOf);
    }
    return starts;
  }
}
