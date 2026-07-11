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
}
