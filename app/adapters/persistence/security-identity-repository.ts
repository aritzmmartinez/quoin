import type {
  CachedIdentity,
  IdentityResolution,
  RawIdentity,
  SecurityIdentityRepository,
} from "~/core/ports";

import { prisma } from "./db.server";

interface Row {
  identity: string;
  identityKind: string;
  canonicalId: string | null;
  status: string;
  source: string;
  resolvedAt: Date;
}

function toResolution(row: Row): IdentityResolution {
  if (row.status === "resolved" && row.canonicalId) {
    return { status: "resolved", canonicalId: row.canonicalId };
  }
  if (row.status === "ambiguous") return { status: "ambiguous", candidates: 0 };
  return { status: "not-found" };
}

export class PrismaSecurityIdentityRepository implements SecurityIdentityRepository {
  async all(): Promise<Map<string, CachedIdentity>> {
    const rows = await prisma.securityIdentity.findMany();
    return new Map(
      rows.map((row) => [
        row.identity,
        {
          value: row.identity,
          kind: row.identityKind === "ISIN" ? ("ISIN" as const) : ("TICKER" as const),
          resolution: toResolution(row),
          source: row.source,
          resolvedAt: row.resolvedAt,
        },
      ]),
    );
  }

  async save(entries: readonly Omit<CachedIdentity, "resolvedAt">[]): Promise<number> {
    if (entries.length === 0) return 0;

    await prisma.$transaction(
      entries.map((entry) => {
        const data = {
          identityKind: entry.kind,
          canonicalId:
            entry.resolution.status === "resolved" ? entry.resolution.canonicalId : null,
          status: entry.resolution.status,
          source: entry.source,
          resolvedAt: new Date(),
        };
        return prisma.securityIdentity.upsert({
          where: { identity: entry.value },
          create: { identity: entry.value, ...data },
          update: data,
        });
      }),
    );

    return entries.length;
  }

  async ambiguous(identities: readonly RawIdentity[]): Promise<RawIdentity[]> {
    const refused = new Set(
      (
        await prisma.securityIdentity.findMany({
          where: { status: "ambiguous" },
          select: { identity: true },
        })
      ).map((row) => row.identity),
    );
    return identities.filter((identity) => refused.has(identity.value));
  }

  async unresolved(identities: readonly RawIdentity[]): Promise<RawIdentity[]> {
    const known = new Set(
      (
        await prisma.securityIdentity.findMany({
          where: { identity: { in: identities.map((i) => i.value) } },
          select: { identity: true },
        })
      ).map((row) => row.identity),
    );
    // Order is preserved because callers sort by weight: the heaviest leaves
    // must be looked up first when the budget runs out.
    return identities.filter((identity) => !known.has(identity.value));
  }
}
