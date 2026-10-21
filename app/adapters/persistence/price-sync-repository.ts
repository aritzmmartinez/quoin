import type { PriceSyncRepository } from "~/core/ports";

import { prisma } from "./db.server";

export class PrismaPriceSyncRepository implements PriceSyncRepository {
  async markChecked(instrumentId: string): Promise<void> {
    const now = new Date();
    await prisma.priceSync.upsert({
      where: { instrumentId },
      create: { instrumentId, checkedAt: now },
      update: { checkedAt: now },
    });
  }

  async lastChecked(): Promise<Map<string, Date>> {
    const rows = await prisma.priceSync.findMany();
    return new Map(rows.map((row) => [row.instrumentId, row.checkedAt]));
  }
}
