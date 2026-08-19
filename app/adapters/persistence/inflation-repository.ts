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

  async deleteSeries(series: string): Promise<number> {
    const { count } = await prisma.inflationIndex.deleteMany({
      where: { series },
    });
    return count;
  }
}
