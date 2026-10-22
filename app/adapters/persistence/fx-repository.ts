import { BASE_CURRENCY } from "~/core/domain";
import { planFxWrite, rateBookFrom, type RateBook } from "~/core/fx";
import {
  fxSeriesKey,
  type FxRate,
  type FxRepository,
  type FxSaveResult,
  type FxSeries,
} from "~/core/ports";

import { prisma } from "./db.server";

const RATE_FIELDS = {
  base: true,
  quote: true,
  day: true,
  rate: true,
  source: true,
} as const;

export class PrismaFxRepository implements FxRepository {
  async save(
    series: FxSeries,
    rates: readonly FxRate[],
  ): Promise<FxSaveResult> {
    if (rates.length === 0) return { inserted: 0, unchanged: 0, conflicts: [] };
    const days = rates.map((rate) => rate.day);

    return prisma.$transaction(async (tx) => {
      const stored = await tx.fxRate.findMany({
        where: { ...series, day: { in: days } },
        select: RATE_FIELDS,
      });
      const { write, ...result } = planFxWrite(series, stored, rates);
      if (write.length > 0) {
        await tx.fxRate.createMany({
          data: write.map(({ base, quote, day, rate, source }) => ({
            base,
            quote,
            day,
            rate,
            source,
          })),
        });
      }
      return result;
    });
  }

  async list(series: FxSeries): Promise<FxRate[]> {
    return prisma.fxRate.findMany({
      where: series,
      orderBy: { day: "asc" },
      select: RATE_FIELDS,
    });
  }

  async book(source: string, quotes: readonly string[]): Promise<RateBook> {
    if (quotes.length === 0) return rateBookFrom([]);
    return rateBookFrom(
      await prisma.fxRate.findMany({
        where: { source, base: BASE_CURRENCY, quote: { in: [...quotes] } },
        select: RATE_FIELDS,
      }),
    );
  }

  async firstDay(series: FxSeries): Promise<string | null> {
    const row = await prisma.fxRate.findFirst({
      where: series,
      orderBy: { day: "asc" },
      select: { day: true },
    });
    return row?.day ?? null;
  }

  async lastDay(series: FxSeries): Promise<string | null> {
    const row = await prisma.fxRate.findFirst({
      where: series,
      orderBy: { day: "desc" },
      select: { day: true },
    });
    return row?.day ?? null;
  }

  async lastSyncedAt(series: FxSeries): Promise<Date | null> {
    const row = await prisma.fxSync.findUnique({
      where: { series: fxSeriesKey(series) },
      select: { checkedAt: true },
    });
    return row?.checkedAt ?? null;
  }

  async markChecked(series: FxSeries): Promise<void> {
    const now = new Date();
    await prisma.fxSync.upsert({
      where: { series: fxSeriesKey(series) },
      create: { series: fxSeriesKey(series), checkedAt: now },
      update: { checkedAt: now },
    });
  }
}
