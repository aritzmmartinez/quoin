import "dotenv/config";

import { argv, exit } from "node:process";

import Decimal from "decimal.js";

import { OpenFigiIdentityResolver } from "~/adapters/identity";
import {
  PrismaHoldingsRepository,
  PrismaInstrumentRepository,
  PrismaSecurityIdentityRepository,
} from "~/adapters/persistence";
import { looksLikeIsin } from "~/adapters/ingestion/holdings";
import type { RawIdentity } from "~/core/ports";

const USAGE = `Usage:
  pnpm identity:resolve [--limit N] [--all]

  Give every holding a canonical id, so the same company arriving as an ISIN
  from one issuer and as a ticker from another stops being two leaves.

  --limit N          stop after N lookups (default 200)
  --all              no limit; without an API key this is about two minutes
                     per thousand identities
  --retry-ambiguous  ask again for the ones previously refused
  --refresh          ask again for EVERY identity, resolved ones included.
                     The cache never re-asks something it has already placed,
                     so this is what fills in a column added afterwards — the
                     primary listing behind the currency view. Pair with --all.
  --report           show what merged, and change nothing

  Set OPENFIGI_API_KEY in .env for a free, much higher rate limit.`;

/**
 * Every identity worth resolving, heaviest first.
 *
 * Order is the whole strategy. Unauthenticated the provider allows a few
 * hundred lookups a minute, and a broad index fund contributes thousands of
 * constituents — but nearly all of them sit in the tail, which is reported
 * rather than drawn. Sorting by weight means a budget of two hundred already
 * covers every row a person can see.
 */
async function identitiesByWeight(): Promise<RawIdentity[]> {
  const [holdings, instruments] = await Promise.all([
    new PrismaHoldingsRepository().all(),
    new PrismaInstrumentRepository().list(),
  ]);

  const weights = new Map<
    string,
    { weight: Decimal; kind: RawIdentity["kind"]; name: string }
  >();

  for (const instrument of instruments) {
    if (!looksLikeIsin(instrument.id)) continue;
    weights.set(instrument.id, {
      weight: new Decimal(1),
      kind: "ISIN",
      name: instrument.name,
    });
  }

  for (const composition of holdings.values()) {
    for (const holding of composition) {
      const weight = new Decimal(holding.weight);
      const existing = weights.get(holding.identity);
      weights.set(holding.identity, {
        weight: existing ? existing.weight.plus(weight) : weight,
        kind: holding.identityKind,
        name: existing?.name ?? holding.name,
      });
    }
  }

  return [...weights.entries()]
    .sort(([, a], [, b]) => b.weight.comparedTo(a.weight))
    .map(([value, { kind, name }]) => ({ value, kind, name }));
}

async function report(cache: PrismaSecurityIdentityRepository): Promise<void> {
  const cached = await cache.all();
  const byCanonical = new Map<string, string[]>();
  const counts = { resolved: 0, "not-found": 0, ambiguous: 0 };

  for (const entry of cached.values()) {
    counts[entry.resolution.status] += 1;
    if (entry.resolution.status !== "resolved") continue;
    const bucket = byCanonical.get(entry.resolution.canonicalId) ?? [];
    bucket.push(entry.value);
    byCanonical.set(entry.resolution.canonicalId, bucket);
  }

  const merged = [...byCanonical.entries()].filter(([, ids]) => ids.length > 1);
  const collapsed = merged.reduce((sum, [, ids]) => sum + ids.length - 1, 0);

  console.log(
    `${cached.size} cached: ${counts.resolved} resolved, ${counts.ambiguous} ambiguous, ${counts["not-found"]} not found.`,
  );
  console.log(
    `${merged.length} companies reached by more than one identity; ${collapsed} duplicate leaves removed.\n`,
  );
  for (const [canonicalId, ids] of merged.slice(0, 25)) {
    console.log(`  ${canonicalId}  ${ids.join("  ")}`);
  }
  if (merged.length > 25) console.log(`  ... and ${merged.length - 25} more`);
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  if (args.includes("--report")) {
    await report(new PrismaSecurityIdentityRepository());
    return;
  }

  const all = args.includes("--all");
  const limitArg = args.indexOf("--limit");
  const limit = all
    ? Number.POSITIVE_INFINITY
    : limitArg === -1
      ? 200
      : Number(args[limitArg + 1]);

  if (!Number.isFinite(limit) && !all) {
    console.error(USAGE);
    exit(1);
  }

  const cache = new PrismaSecurityIdentityRepository();
  const ranked = await identitiesByWeight();
  const retry = args.includes("--retry-ambiguous");
  const refresh = args.includes("--refresh");
  const pending = retry
    ? await cache.ambiguous(ranked)
    : refresh
      ? ranked
      : await cache.unresolved(ranked);

  console.log(
    retry
      ? `${pending.length} previously ambiguous to ask again.`
      : refresh
        ? `${pending.length} identities to ask again, cached ones included.`
        : `${ranked.length} identities, ${ranked.length - pending.length} already cached, ${pending.length} to look up.`,
  );
  if (pending.length === 0) return;

  const apiKey = process.env.OPENFIGI_API_KEY;
  if (!apiKey) {
    console.log(
      "No OPENFIGI_API_KEY set: limited to 10 lookups per request, 25 requests a minute.",
    );
  }

  const budget = Math.min(pending.length, limit);
  const resolver = new OpenFigiIdentityResolver({
    apiKey,
    maxIdentities: budget,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) {
        console.log(`  ${done}/${total}`);
      }
    },
  });

  const resolved = await resolver.resolve(pending);

  const entries = pending.slice(0, budget).map((identity) => ({
    ...identity,
    resolution:
      resolved.get(identity.value) ?? ({ status: "not-found" } as const),
    source: resolver.source,
  }));
  await cache.save(entries);

  const counts = { resolved: 0, "not-found": 0, ambiguous: 0 };
  for (const entry of entries) counts[entry.resolution.status] += 1;

  console.log(
    `\nSaved ${entries.length}: ${counts.resolved} resolved, ${counts["not-found"]} not found, ${counts.ambiguous} ambiguous.`,
  );
  if (pending.length > budget) {
    console.log(
      `${pending.length - budget} still pending — run again, or pass --all.`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    exit(1);
  })
  .finally(() => exit(0));
