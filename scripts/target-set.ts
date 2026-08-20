import "dotenv/config";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { argv, exit } from "node:process";

import Decimal from "decimal.js";

import {
  PrismaInstrumentRepository,
  PrismaTargetRepository,
  prisma,
} from "~/adapters/persistence";
import {
  deriveTargetWeights,
  findIdMismatches,
  getActiveTarget,
  monthlyTotal,
  parseTargetLines,
  TargetParseError,
  type PortfolioTarget,
} from "~/core/domain";

const USAGE = `Usage:
  pnpm target:set                      show the target in force today
  pnpm target:set <file> [options]     record a new version from a plan file

  --from=YYYY-MM-DD   the date this version takes over (default: today)
  --name=<name>       label for the version (default: the file's name)
  --note=<text>       why the plan changed

The file is one line per instrument, "<instrumentId> <monthlyAmount>":

  # savings plan
  IE00B3RBWM25  300
  IE00BKM4GZ66   75

Amounts are the fact; weights are derived from them. A version is never edited:
changing the plan means recording another one with a later --from.`;

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv
    .slice(3)
    .find((a) => a.startsWith(prefix))
    ?.slice(prefix.length);
}

function describe(
  target: PortfolioTarget,
  names: ReadonlyMap<string, string>,
): void {
  const total = monthlyTotal(target);
  console.log(
    `${target.name}  (from ${target.activeFrom.toISOString().slice(0, 10)})`,
  );
  if (target.note) console.log(`  note: ${target.note}`);

  for (const line of deriveTargetWeights(target)) {
    const known = names.get(line.instrumentId);
    const percent = `${new Decimal(line.weight).mul(100).toFixed(1)}%`;
    console.log(
      `  ${line.instrumentId.padEnd(14)} ${line.monthlyAmount.padStart(8)} EUR/month  ${percent.padStart(6)}  ${known ?? "⚠ no instrument imported yet"}`,
    );
  }
  console.log(`  ${"total".padEnd(14)} ${total.padStart(8)} EUR/month`);
}

async function main(): Promise<void> {
  const [file] = argv.slice(2);

  const instruments = await new PrismaInstrumentRepository().list();
  const names = new Map(instruments.map((i) => [i.id, i.name]));
  const repo = new PrismaTargetRepository();

  if (!file || file === "--help") {
    const active = getActiveTarget(await repo.list(), new Date());
    if (!active) {
      console.log("No target recorded yet.\n");
      console.log(USAGE);
      return;
    }
    describe(active, names);
    return;
  }

  let lines;
  try {
    lines = parseTargetLines(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof TargetParseError) {
      console.error(`${file}: ${error.message}`);
      exit(1);
    }
    throw error;
  }

  if (lines.length === 0) {
    console.error(`${file} has no target lines.\n\n${USAGE}`);
    exit(1);
  }

  const fromArg = flag("from");
  const activeFrom = fromArg ? new Date(fromArg) : new Date();
  if (Number.isNaN(activeFrom.getTime())) {
    console.error(`"--from=${fromArg}" is not a date (use YYYY-MM-DD).`);
    exit(1);
  }

  const mismatches = findIdMismatches(lines, names.keys());
  if (mismatches.length > 0) {
    console.error(
      "Nothing was recorded. These ids do not match the ones imported:\n",
    );
    for (const { given, likely } of mismatches) {
      console.error(`  ${given}  ->  ${likely}   (${names.get(likely) ?? ""})`);
    }
    console.error(
      "\nA target line joins its instrument by exact id, so these would never resolve.",
    );
    exit(1);
  }

  const target: PortfolioTarget = {
    id: randomUUID(),
    name: flag("name") ?? basename(file).replace(/\.[^.]+$/, ""),
    activeFrom,
    note: flag("note") ?? null,
    createdAt: new Date(),
    lines,
  };

  await repo.create(target);
  console.log(`Recorded a new target version.\n`);
  describe(target, names);

  const unknown = lines.filter((l) => !names.has(l.instrumentId));
  if (unknown.length > 0) {
    console.warn(
      `\n⚠ ${unknown.length} of ${lines.length} line(s) name an instrument that has not been imported: ${unknown.map((l) => l.instrumentId).join(", ")}.`,
    );
    console.warn(
      "  Each stays in the plan and joins its position when an import creates an instrument with exactly that id.",
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      "\nSetting the target failed:",
      error instanceof Error ? error.message : error,
    );
    exit(1);
  })
  .finally(() => prisma.$disconnect());
