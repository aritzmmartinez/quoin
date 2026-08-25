import "dotenv/config";

import { argv, exit } from "node:process";

import Decimal from "decimal.js";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  prisma,
} from "~/adapters/persistence";
import {
  KINDS_NEEDING_LEAF,
  exposureKindSchema,
  resolveIntrinsic,
  type ExposureKind,
} from "~/core/domain";
import { computePositions } from "~/core/projections";

const KINDS = exposureKindSchema.options;

const USAGE = `Usage:
  pnpm exposure:map                        list every instrument and how it resolves
  pnpm exposure:map <ISIN>                 show one instrument
  pnpm exposure:map <ISIN> <KIND> [LEAF]   set the exposure kind
  pnpm exposure:map <ISIN> --clear         fall back to the type default

  KIND: ${KINDS.join(" | ")}
  LEAF: required for ${KINDS_NEEDING_LEAF.join(" and ")} (e.g. XAU, XAG, BTC)

Trade Republic reports both funds and ETCs as asset_class FUND, so a gold ETC is
stored as an ETF and cannot be told apart from an equity fund. Ingestion never
writes these columns, so a re-import will not clobber what you set here.

Examples:
  pnpm exposure:map XS00TEST0003 COMMODITY XAU
  pnpm exposure:map IE00TEST0004 BOND_FUND`;

async function heldQuantity(instrumentId: string): Promise<Decimal> {
  const events = await new PrismaLedgerRepository().list();
  return computePositions(events)
    .filter((p) => p.instrumentId === instrumentId)
    .reduce((sum, p) => sum.plus(new Decimal(p.quantity)), new Decimal(0));
}

async function describe(id: string): Promise<void> {
  const instrument = await new PrismaInstrumentRepository().get(id);
  if (!instrument) return;

  const [leaf] = resolveIntrinsic(instrument);
  const source = instrument.exposureKind
    ? "explicit"
    : `default from type=${instrument.type}`;

  console.log(`${instrument.id}  ${instrument.name}`);
  console.log(
    `  exposureKind: ${instrument.exposureKind ?? "(none)"}  (${source})`,
  );
  console.log(`  resolves to:  ${leaf?.leaf.kind}:${leaf?.leaf.id}`);

  // The sanity check that prices:map lacks: on a closed position every derived
  // number is zero, so a wrong mapping looks identical to a right one.
  const qty = await heldQuantity(id);
  if (qty.isZero()) {
    console.log(
      "  ⚠ position is CLOSED — nothing here will show up on the allocation screen.",
    );
  }
}

async function main(): Promise<void> {
  const [id, kindArg, leafArg] = argv.slice(2);

  if (!id) {
    const instruments = await new PrismaInstrumentRepository().list();
    if (instruments.length === 0) {
      console.log("No instruments yet — run pnpm ingest first.\n");
      console.log(USAGE);
      return;
    }
    const unmapped: string[] = [];
    for (const instrument of instruments) {
      const [leaf] = resolveIntrinsic(instrument);
      const mark = instrument.exposureKind ? " " : "·";
      const resolved = leaf ? `${leaf.leaf.kind}:${leaf.leaf.id}` : "—";
      console.log(
        `${mark} ${instrument.id.padEnd(14)} ${resolved.padEnd(28)} ${instrument.name}`,
      );
      if (leaf?.leaf.kind === "UNRESOLVED" && !instrument.exposureKind) {
        unmapped.push(instrument.id);
      }
    }
    console.log(`\n· = using the type default, not an explicit mapping.`);
    if (unmapped.length > 0) {
      console.log(
        `\n${unmapped.length} instrument(s) fall back to UNRESOLVED. If any is an ETC or a bond fund, map it:`,
      );
      console.log(`  pnpm exposure:map ${unmapped[0]} <KIND> [LEAF]`);
    }
    return;
  }

  const repo = new PrismaInstrumentRepository();
  const instrument = await repo.get(id);
  if (!instrument) {
    console.error(`No instrument found with id "${id}".`);
    exit(1);
  }

  if (kindArg === undefined) {
    await describe(id);
    return;
  }

  if (kindArg === "--clear") {
    await repo.setExposure(id, null, null);
    console.log(`Cleared the explicit mapping for ${id}.`);
    await describe(id);
    return;
  }

  const parsed = exposureKindSchema.safeParse(kindArg);
  if (!parsed.success) {
    console.error(`Unknown kind "${kindArg}".\n\n${USAGE}`);
    exit(1);
  }
  const kind: ExposureKind = parsed.data;

  // Gold's leaf is XAU, not its ISIN — two ETCs on the same metal must land on
  // the same leaf or the concentration is silently split in two.
  if (KINDS_NEEDING_LEAF.includes(kind) && !leafArg) {
    console.error(`${kind} needs a leaf id.\n\n${USAGE}`);
    exit(1);
  }

  await repo.setExposure(id, kind, leafArg ?? null);
  await describe(id);
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nMapping failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
