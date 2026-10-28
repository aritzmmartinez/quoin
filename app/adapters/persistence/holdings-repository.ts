import type {
  EtfHolding,
  HoldingsBlock,
  HoldingsRepository,
} from "~/core/ports";

import { prisma } from "./db.server";
import { stamp } from "./hlc";

interface EtfHoldingRow {
  instrumentId: string;
  identity: string;
  identityKind: string;
  name: string;
  weight: string;
}

function rowToHolding(row: EtfHoldingRow): EtfHolding {
  return {
    instrumentId: row.instrumentId,
    identity: row.identity,
    identityKind: row.identityKind === "ISIN" ? "ISIN" : "TICKER",
    name: row.name,
    weight: row.weight,
  };
}

const sameRows = (
  a: readonly EtfHolding[],
  b: readonly EtfHolding[],
): boolean => {
  if (a.length !== b.length) return false;
  const byIdentity = new Map(b.map((h) => [h.identity, h]));
  return a.every((h) => {
    const other = byIdentity.get(h.identity);
    return (
      other !== undefined &&
      other.identityKind === h.identityKind &&
      other.name === h.name &&
      other.weight === h.weight
    );
  });
};

export class PrismaHoldingsRepository implements HoldingsRepository {
  async replaceFor(
    instrumentId: string,
    holdings: readonly EtfHolding[],
    block: HoldingsBlock,
  ): Promise<number> {
    // One transaction: a half-replaced composition would report weights that do
    // not add up, which is worse than the old one. Dropping the same file again
    // changes nothing, so it issues no mark: with no date of its own, its day is
    // only the day of this drop, which says nothing about the composition.
    return prisma.$transaction(async (tx) => {
      const [stored, rows] = await Promise.all([
        tx.etfHoldingBlock.findUnique({ where: { instrumentId } }),
        tx.etfHolding.findMany({ where: { instrumentId } }),
      ]);
      if (
        stored &&
        sameRows(rows.map(rowToHolding), holdings) &&
        (block.asOfInferred ||
          (stored.asOf === block.asOf && !stored.asOfInferred))
      ) {
        return holdings.length;
      }

      const hlc = await stamp(tx);
      await tx.etfHolding.deleteMany({ where: { instrumentId } });
      const created = await tx.etfHolding.createMany({
        data: holdings.map((h) => ({
          instrumentId,
          identity: h.identity,
          identityKind: h.identityKind,
          name: h.name,
          weight: h.weight,
        })),
      });
      const data = { asOf: block.asOf, asOfInferred: block.asOfInferred, hlc };
      await tx.etfHoldingBlock.upsert({
        where: { instrumentId },
        create: { instrumentId, ...data },
        update: data,
      });
      return created.count;
    });
  }

  async all(): Promise<Map<string, EtfHolding[]>> {
    const rows = await prisma.etfHolding.findMany({
      orderBy: { weight: "desc" },
      select: {
        instrumentId: true,
        identity: true,
        identityKind: true,
        name: true,
        weight: true,
      },
    });
    const byInstrument = new Map<string, EtfHolding[]>();
    for (const row of rows) {
      const holding = rowToHolding(row);
      const bucket = byInstrument.get(holding.instrumentId) ?? [];
      bucket.push(holding);
      byInstrument.set(holding.instrumentId, bucket);
    }
    return byInstrument;
  }

  async blocks(): Promise<Map<string, HoldingsBlock>> {
    const rows = await prisma.etfHoldingBlock.findMany();
    return new Map(
      rows.map((row) => [
        row.instrumentId,
        { asOf: row.asOf, asOfInferred: row.asOfInferred },
      ]),
    );
  }

  async forInstrument(instrumentId: string): Promise<EtfHolding[]> {
    const rows = await prisma.etfHolding.findMany({ where: { instrumentId } });
    return rows.map(rowToHolding);
  }
}
