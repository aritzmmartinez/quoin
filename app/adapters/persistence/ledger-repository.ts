import type { LedgerEvent } from "~/core/domain";
import type { LedgerEventFilter, LedgerRepository } from "~/core/ports";

import { prisma } from "./db.server";
import { eventToCreateData, rowToEvent } from "./mappers";

/**
 * Prisma-backed implementation of the LedgerRepository port.
 * The domain never sees Prisma; rows are validated and mapped to domain events here.
 */
export class PrismaLedgerRepository implements LedgerRepository {
  async append(
    events: readonly LedgerEvent[],
  ): Promise<{ inserted: number; skipped: number }> {
    // Idempotency is keyed on (source, externalId). Events without an externalId
    // (e.g. manual entries) are always inserted — NULLs are distinct in SQLite.
    const withExternalId = events.filter(
      (event): event is LedgerEvent & { externalId: string } =>
        event.externalId != null && event.externalId !== "",
    );

    const existingKeys = new Set<string>();
    if (withExternalId.length > 0) {
      const existing = await prisma.ledgerEntry.findMany({
        where: {
          OR: withExternalId.map((event) => ({
            source: event.source,
            externalId: event.externalId,
          })),
        },
        select: { source: true, externalId: true },
      });
      for (const row of existing) {
        existingKeys.add(`${row.source}::${row.externalId}`);
      }
    }

    const toInsert = events.filter(
      (event) =>
        event.externalId == null ||
        event.externalId === "" ||
        !existingKeys.has(`${event.source}::${event.externalId}`),
    );

    if (toInsert.length > 0) {
      await prisma.ledgerEntry.createMany({
        data: toInsert.map(eventToCreateData),
      });
    }

    return {
      inserted: toInsert.length,
      skipped: events.length - toInsert.length,
    };
  }

  async list(filter?: LedgerEventFilter): Promise<LedgerEvent[]> {
    const rows = await prisma.ledgerEntry.findMany({
      where: {
        instrumentId: filter?.instrumentId,
        sleeve: filter?.sleeve,
      },
      orderBy: { ts: "asc" },
    });
    return rows.map(rowToEvent);
  }
}
