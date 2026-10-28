import { randomUUID } from "node:crypto";

import { portfolioTargetSchema, residenceSchema } from "~/core/domain";
import {
  TARGET_ENTITY,
  type HoldingsBlockRow,
  type MergePlan,
  type Peer,
  type SyncState,
} from "~/core/sync";

import { prisma } from "./db.server";
import type { Prisma } from "./generated/client";
import { stamp } from "./hlc";
import { eventToCreateData, rowToEvent, rowToInstrument } from "./mappers";

const ONE = 1;

export interface SyncDevice {
  deviceId: string;
  name: string | null;
}

export class PrismaSyncRepository {
  async device(): Promise<SyncDevice> {
    const row = await prisma.syncDevice.findUniqueOrThrow({
      where: { id: ONE },
    });
    return { deviceId: row.deviceId, name: row.name };
  }

  async exportMark(): Promise<string> {
    return prisma.$transaction((tx) => stamp(tx));
  }

  async state(): Promise<SyncState> {
    const [
      device,
      peers,
      ledger,
      instruments,
      targets,
      tombstones,
      blocks,
      holdings,
      identities,
      settings,
    ] = await Promise.all([
      this.device(),
      prisma.syncPeer.findMany({ orderBy: { deviceId: "asc" } }),
      prisma.ledgerEntry.findMany({
        orderBy: [{ source: "asc" }, { externalId: "asc" }],
      }),
      prisma.instrument.findMany({ orderBy: { id: "asc" } }),
      prisma.portfolioTarget.findMany({
        include: { lines: { orderBy: { instrumentId: "asc" } } },
        orderBy: { id: "asc" },
      }),
      prisma.syncTombstone.findMany({
        orderBy: [{ entity: "asc" }, { key: "asc" }],
      }),
      prisma.etfHoldingBlock.findMany({ orderBy: { instrumentId: "asc" } }),
      prisma.etfHolding.findMany({
        orderBy: [{ instrumentId: "asc" }, { identity: "asc" }],
      }),
      prisma.securityIdentity.findMany({ orderBy: { identity: "asc" } }),
      prisma.settings.findUniqueOrThrow({ where: { id: ONE } }),
    ]);

    return {
      deviceId: device.deviceId,
      peers: peers.map((p) => ({ deviceId: p.deviceId, seen: p.seen })),
      ledger: ledger.map(
        ({ id: _id, createdAt: _createdAt, externalId, ts, ...row }) => ({
          ...row,
          type: row.type as SyncState["ledger"][number]["type"],
          funding: row.funding as SyncState["ledger"][number]["funding"],
          externalId: externalId ?? "",
          ts: ts.toISOString(),
        }),
      ),
      instruments: instruments.map(({ createdAt: _createdAt, ...row }) => row),
      targets: targets.map((t) => ({
        id: t.id,
        name: t.name,
        activeFrom: t.activeFrom ?? "",
        note: t.note,
        createdAt: t.createdAt.toISOString(),
        lines: t.lines.map((l) => ({
          instrumentId: l.instrumentId,
          monthlyAmount: l.monthlyAmount,
        })),
      })),
      tombstones: tombstones.map((t) => ({
        entity: TARGET_ENTITY,
        key: t.key,
        hlc: t.hlc,
      })),
      holdings: blocks.map((b) => ({
        instrumentId: b.instrumentId,
        asOf: b.asOf,
        asOfInferred: b.asOfInferred,
        hlc: b.hlc,
        rows: holdings
          .filter((h) => h.instrumentId === b.instrumentId)
          .map((h) => ({
            identity: h.identity,
            identityKind: h.identityKind as "ISIN" | "TICKER",
            name: h.name,
            weight: h.weight,
          })),
      })),
      identities: identities.map((i) => ({
        ...i,
        identityKind: i.identityKind as "ISIN" | "TICKER",
        status: i.status as "resolved" | "not-found" | "ambiguous",
        resolvedAt: i.resolvedAt.toISOString(),
      })),
      settings: {
        residence: settings.residence,
        residenceHlc: settings.residenceHlc,
      },
    };
  }

  async apply(
    plan: MergePlan["apply"],
    sender: SyncDevice,
    now: Date,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const row of plan.instruments.insert) {
        rowToInstrument(row);
        await tx.instrument.create({ data: row });
      }
      for (const { id, patch } of plan.instruments.update) {
        const current = await tx.instrument.findUniqueOrThrow({
          where: { id },
        });
        rowToInstrument({ ...current, ...patch });
        await tx.instrument.update({ where: { id }, data: patch });
        // Two symbols' prices never share a series; the effect downloads the new one.
        if ("quoteSymbol" in patch) {
          await tx.priceSnapshot.deleteMany({ where: { instrumentId: id } });
        }
      }

      if (plan.ledger.insert.length > 0) {
        await tx.ledgerEntry.createMany({
          data: plan.ledger.insert.map((row) =>
            eventToCreateData(
              rowToEvent({ ...row, id: randomUUID(), ts: new Date(row.ts) }),
            ),
          ),
        });
      }
      for (const key of plan.ledger.markInKind) {
        const [source, externalId] = splitKey(key);
        await tx.ledgerEntry.updateMany({
          where: { source, externalId, funding: "CASH" },
          data: { funding: "IN_KIND" },
        });
      }

      for (const target of plan.targets.insert) {
        const parsed = portfolioTargetSchema.parse({
          ...target,
          createdAt: new Date(target.createdAt),
        });
        await tx.portfolioTarget.create({
          data: {
            id: parsed.id,
            name: parsed.name,
            activeFrom: parsed.activeFrom,
            note: parsed.note ?? null,
            createdAt: parsed.createdAt,
            lines: { create: parsed.lines },
          },
        });
      }
      if (plan.targets.delete.length > 0) {
        await tx.portfolioTarget.deleteMany({
          where: { id: { in: plan.targets.delete } },
        });
      }
      if (plan.tombstones.length > 0) {
        await tx.syncTombstone.createMany({ data: plan.tombstones });
      }

      for (const block of plan.holdings) await replaceBlock(tx, block);

      for (const { identity, resolvedAt, ...row } of plan.identities) {
        const data = { ...row, resolvedAt: new Date(resolvedAt) };
        await tx.securityIdentity.upsert({
          where: { identity },
          create: { identity, ...data },
          update: data,
        });
      }

      if (plan.settings) {
        const { residence, residenceHlc } = plan.settings;
        await tx.settings.update({
          where: { id: ONE },
          data: {
            ...(residence !== undefined
              ? { residence: residenceSchema.parse(residence) }
              : {}),
            ...(residenceHlc !== undefined ? { residenceHlc } : {}),
          },
        });
      }

      await writePeers(tx, plan.peers, sender, now);
    });
  }

  async savePeers(
    peers: readonly Peer[],
    sender: SyncDevice,
    now: Date,
  ): Promise<void> {
    await prisma.$transaction((tx) => writePeers(tx, peers, sender, now));
  }
}

async function writePeers(
  tx: Prisma.TransactionClient,
  peers: readonly Peer[],
  sender: SyncDevice,
  now: Date,
): Promise<void> {
  for (const { deviceId, seen } of peers) {
    const data =
      deviceId === sender.deviceId
        ? { seen, name: sender.name, lastSyncedAt: now }
        : { seen };
    await tx.syncPeer.upsert({
      where: { deviceId },
      create: { deviceId, ...data },
      update: data,
    });
  }
}

function splitKey(key: string): [string, string] {
  const at = key.indexOf("::");
  return [key.slice(0, at), key.slice(at + 2)];
}

async function replaceBlock(
  tx: Prisma.TransactionClient,
  block: HoldingsBlockRow,
): Promise<void> {
  const { instrumentId, rows, ...meta } = block;
  await tx.etfHolding.deleteMany({ where: { instrumentId } });
  await tx.etfHolding.createMany({
    data: rows.map((row) => ({ instrumentId, ...row })),
  });
  await tx.etfHoldingBlock.upsert({
    where: { instrumentId },
    create: { instrumentId, ...meta },
    update: meta,
  });
}
