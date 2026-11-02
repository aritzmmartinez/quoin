import "dotenv/config";

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

import { ZodError } from "zod";

import { prisma } from "~/adapters/persistence";
import {
  conflictKey,
  SameDeviceError,
  UnknownResolutionError,
  UnsupportedSchemaVersionError,
  type Conflict,
  type Effect,
  type LedgerConflict,
  type Resolution,
} from "~/core/sync";
import { describeFailure } from "~/lib/describe-failure";
import type { ImportResult } from "~/lib/sync";
import { importSync } from "~/lib/sync.server";

import { backupDatabase, describeBackup } from "./lib/backup";
import { announceDatabase, realDatabasePath } from "./lib/db-target";

const USAGE = `Usage: pnpm sync:import <file> [--dry-run] [--keep <key>]... [--take <key>]...

Merges a file written by \`pnpm sync:export\` on another device into this
database, in one transaction. With an open conflict nothing is written and
every conflict is listed with its key. A ledger entry that differs on the two
sides is set aside: each side keeps its own, the rest is applied, and the
command exits with 1. Into the live ledger, a verified backup is taken first.

  --dry-run      show what would be applied, the conflicts and the effects
  --keep <key>   resolve a conflict with the value here; it travels on the next sync
  --take <key>   resolve a conflict with the value in the file`;

function describeConflict(conflict: Conflict): string {
  switch (conflict.kind) {
    case "field":
      return `${conflict.entity} ${conflict.key}: ${conflict.field} is ${JSON.stringify(conflict.local)} here and ${JSON.stringify(conflict.incoming)} there, changed on both sides`;
    case "target":
      return `plan version ${conflict.id}: differs on the two sides`;
    case "target-day":
      return `plan versions ${conflict.local} (here) and ${conflict.incoming} (there): both take over on ${conflict.day}`;
    case "holdings":
      return `composition of ${conflict.instrumentId}: replaced on both sides, with no day read from a file to tell which is newer`;
  }
}

function describeSetAside(row: LedgerConflict): string {
  return `ledger entry ${row.key}: differs in ${row.fields.join(", ")}`;
}

function parseArgs(args: readonly string[]) {
  let dryRun = false;
  const files: string[] = [];
  const resolutions = new Map<string, Resolution>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--keep" || arg === "--take") {
      const key = args[++i];
      if (!key || resolutions.has(key)) return null;
      resolutions.set(key, arg === "--keep" ? "keep" : "take");
    } else if (arg.startsWith("--")) {
      return null;
    } else {
      files.push(arg);
    }
  }
  const [file, ...rest] = files;
  return file && rest.length === 0 ? { file, dryRun, resolutions } : null;
}

function describeEffect(effect: Effect): string {
  return effect.kind === "prices"
    ? `download the price history of ${effect.instrumentId} (${effect.symbol})`
    : `sync ${effect.currency} rates from ${effect.since.slice(0, 10)}`;
}

function reportSetAside(result: ImportResult): boolean {
  const { setAside } = result.plan;
  if (setAside.length === 0 || result.status === "conflicts") return true;
  console.error(
    `\n${setAside.length} ledger entr${setAside.length === 1 ? "y" : "ies"} set aside; each side keeps its own:`,
  );
  for (const row of setAside) console.error(`  ${describeSetAside(row)}`);
  return false;
}

function report(result: ImportResult): boolean {
  if (result.status === "up-to-date") {
    console.log("Already up to date.");
    return reportSetAside(result);
  }
  const { counts } = result;
  console.log(
    [
      `Ledger: ${counts.ledger} new, ${counts.inKind} marked in kind, ${counts.setAside} set aside`,
      `Instruments: ${counts.newInstruments} new, ${counts.changedInstruments} changed`,
      `Plan versions: ${counts.newTargets} new, ${counts.deletedTargets} deleted`,
      `Compositions: ${counts.newHoldings} new, ${counts.replacedHoldings} replaced`,
      `Identities: ${counts.newIdentities} new, ${counts.updatedIdentities} updated`,
      `Settings: ${counts.settings ? "changed" : "unchanged"}`,
      `Kept here, to send on the next sync: ${counts.restamped}`,
    ].join("\n"),
  );

  if (result.status === "conflicts") {
    console.error(
      `\n${result.plan.conflicts.length} conflict(s); nothing was written:`,
    );
    for (const conflict of result.plan.conflicts) {
      console.error(
        `  [${conflictKey(conflict)}] ${describeConflict(conflict)}`,
      );
    }
    console.error(
      "\nResolve each with --keep <key> (the value here) or --take <key> (the value in the file).",
    );
    return false;
  }

  if (result.status === "dry-run") {
    console.log("\nDry run: nothing was written.");
    if (result.plan.effects.length > 0) console.log("Afterwards it would:");
    for (const effect of result.plan.effects)
      console.log(`  ${describeEffect(effect)}`);
    return reportSetAside(result);
  }

  console.log("\nApplied.");
  const failed = result.effects.filter((outcome) => !outcome.ok);
  for (const outcome of result.effects) {
    const status = outcome.ok ? "done" : `FAILED (${outcome.reason})`;
    console.log(`  ${describeEffect(outcome.effect)}: ${status}`);
  }
  if (failed.length > 0) {
    console.error(
      `\nThe data is applied, but ${failed.length} follow-up step(s) failed. ` +
        "Run them again from Instruments (Download the history again) or with " +
        "`pnpm prices:rebuild <ISIN>` / `pnpm fx:sync <CODE>`.",
    );
  }
  return reportSetAside(result) && failed.length === 0;
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (!args) {
    console.error(USAGE);
    exit(1);
  }
  const { file, dryRun, resolutions } = args;

  const target = announceDatabase();
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));

  const result = await importSync(raw, {
    dryRun,
    resolutions,
    ...(target.kind === "ledger"
      ? {
          beforeApply: () => {
            try {
              console.error(describeBackup(backupDatabase(realDatabasePath())));
            } catch (error) {
              throw new Error(
                `Backup failed, nothing was imported: ${describeFailure(error)}`,
                { cause: error },
              );
            }
          },
        }
      : {}),
  });
  if (!report(result)) exit(1);
}

main()
  .catch((error: unknown) => {
    if (error instanceof ZodError) {
      console.error("Not a valid sync file:");
      for (const issue of error.issues) {
        console.error(
          `  ${issue.path.join(".") || "(file)"}: ${issue.message}`,
        );
      }
    } else if (
      error instanceof UnsupportedSchemaVersionError ||
      error instanceof SameDeviceError ||
      error instanceof UnknownResolutionError
    ) {
      console.error(error.message);
    } else {
      console.error("\nSync import stopped:", describeFailure(error));
    }
    exit(1);
  })
  .finally(() => prisma.$disconnect());
