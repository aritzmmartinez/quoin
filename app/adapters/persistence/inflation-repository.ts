import type { InflationPoint, InflationRepository } from "~/core/ports";

import { prisma } from "./db.server";

export class PrismaInflationRepository implements InflationRepository {
  async saveMany(points: readonly InflationPoint[]): Promise<number> {
    if (points.length === 0) return 0;
    await prisma.$transaction(
      points.map((p) =>
        prisma.inflationIndex.upsert({
          where: { series_period: { series: p.series, period: p.period } },
          create: {
            series: p.series,
            period: p.period,
            indexValue: p.indexValue,
            base: p.base,
            source: p.source,
          },
          update: { indexValue: p.indexValue, base: p.base, source: p.source },
        }),
      ),
    );
    return points.length;
  }

  async list(series: string): Promise<InflationPoint[]> {
    const rows = await prisma.inflationIndex.findMany({
      where: { series },
      orderBy: { period: "asc" },
    });
    return rows.map((r) => ({
      series: r.series,
      period: r.period,
      indexValue: r.indexValue,
      base: r.base,
      source: r.source,
    }));
  }

  async lastSyncedAt(series: string): Promise<Date | null> {
    const row = await prisma.inflationSync.findUnique({
      where: { series },
      select: { checkedAt: true },
    });
    return row?.checkedAt ?? null;
  }

  async markChecked(series: string): Promise<void> {
    const now = new Date();
    await prisma.inflationSync.upsert({
      where: { series },
      create: { series, checkedAt: now },
      update: { checkedAt: now },
    });
  }

  async deleteSeries(series: string): Promise<number> {
    const { count } = await prisma.inflationIndex.deleteMany({
      where: { series },
    });
    return count;
  }
}
