import type { LedgerEvent } from "~/core/domain";
import {
  ledgerDedupKey,
  type LedgerEventFilter,
  type LedgerRepository,
} from "~/core/ports";

import { prisma } from "./db.server";
import { eventToCreateData, rowToEvent } from "./mappers";

export class PrismaLedgerRepository implements LedgerRepository {
  async existing(events: readonly LedgerEvent[]): Promise<Set<string>> {
    const withId = events.filter(
      (event): event is LedgerEvent & { externalId: string } =>
        event.externalId != null && event.externalId !== "",
    );
    if (withId.length === 0) return new Set();

    const rows = await prisma.ledgerEntry.findMany({
      where: {
        OR: withId.map((event) => ({
          source: event.source,
          externalId: event.externalId,
        })),
      },
      select: { source: true, externalId: true },
    });

    return new Set(
      rows.map((row) => ledgerDedupKey(row.source, row.externalId ?? "")),
    );
  }

  async append(
    events: readonly LedgerEvent[],
  ): Promise<{ inserted: number; skipped: number }> {
    const existing = await this.existing(events);
    const toInsert = events.filter(
      (event) =>
        !event.externalId ||
        !existing.has(ledgerDedupKey(event.source, event.externalId)),
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
