import type { EtfHolding, HoldingsRepository } from "~/core/ports";

import { prisma } from "./db.server";

interface EtfHoldingRow {
  instrumentId: string;
  identity: string;
  identityKind: string;
  name: string;
  weight: string;
  asOf: Date;
}

function rowToHolding(row: EtfHoldingRow): EtfHolding {
  return {
    instrumentId: row.instrumentId,
    identity: row.identity,
    identityKind: row.identityKind === "ISIN" ? "ISIN" : "TICKER",
    name: row.name,
    weight: row.weight,
    asOf: row.asOf,
  };
}

export class PrismaHoldingsRepository implements HoldingsRepository {
  async replaceFor(
    instrumentId: string,
    holdings: readonly EtfHolding[],
  ): Promise<number> {
    // One transaction: a half-replaced composition would report weights that do
    // not add up, which is worse than the old one.
    const [, created] = await prisma.$transaction([
      prisma.etfHolding.deleteMany({ where: { instrumentId } }),
      prisma.etfHolding.createMany({
        data: holdings.map((h) => ({
          instrumentId,
          identity: h.identity,
          identityKind: h.identityKind,
          name: h.name,
          weight: h.weight,
          asOf: h.asOf,
        })),
      }),
    ]);
    return created.count;
  }

  async all(): Promise<Map<string, EtfHolding[]>> {
    const rows = await prisma.etfHolding.findMany({ orderBy: { weight: "desc" } });
    const byInstrument = new Map<string, EtfHolding[]>();
    for (const row of rows) {
      const holding = rowToHolding(row);
      const bucket = byInstrument.get(holding.instrumentId) ?? [];
      bucket.push(holding);
      byInstrument.set(holding.instrumentId, bucket);
    }
    return byInstrument;
  }

  async forInstrument(instrumentId: string): Promise<EtfHolding[]> {
    const rows = await prisma.etfHolding.findMany({ where: { instrumentId } });
    return rows.map(rowToHolding);
  }

  async deleteForInstrument(instrumentId: string): Promise<number> {
    const { count } = await prisma.etfHolding.deleteMany({ where: { instrumentId } });
    return count;
  }
}
