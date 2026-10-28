import "dotenv/config";

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

import { ZodError } from "zod";

import { prisma } from "~/adapters/persistence";
import {
  SameDeviceError,
  UnsupportedSchemaVersionError,
  type Conflict,
  type Effect,
} from "~/core/sync";
import { describeFailure } from "~/lib/describe-failure";
import type { ImportResult } from "~/lib/sync";
import { importSync } from "~/lib/sync.server";

import { backupDatabase, describeBackup } from "./lib/backup";
import { announceDatabase, realDatabasePath } from "./lib/db-target";

const USAGE = `Usage: pnpm sync:import <file> [--dry-run]

Merges a file written by \`pnpm sync:export\` on another device into this
database, in one transaction. With a conflict nothing is written and every
conflict is listed. Into the live ledger, a verified backup is taken first.

  --dry-run   show what would be applied, the conflicts and the effects`;

function describeConflict(conflict: Conflict): string {
  switch (conflict.kind) {
    case "field":
      return `${conflict.entity} ${conflict.key}: ${conflict.field} is ${JSON.stringify(conflict.local)} here and ${JSON.stringify(conflict.incoming)} there, changed on both sides`;
    case "ledger":
      return `ledger entry ${conflict.key}: differs in ${conflict.fields.join(", ")}`;
    case "target":
      return `plan version ${conflict.id}: differs on the two sides`;
    case "target-day":
      return `plan versions ${conflict.ids.join(", ")}: both take over on ${conflict.day}`;
    case "holdings":
      return `composition of ${conflict.instrumentId}: replaced on both sides, with no day read from a file to tell which is newer`;
  }
}

function describeEffect(effect: Effect): string {
  return effect.kind === "prices"
    ? `download the price history of ${effect.instrumentId} (${effect.symbol})`
    : `sync ${effect.currency} rates from ${effect.since.slice(0, 10)}`;
}

function report(result: ImportResult): boolean {
  if (result.status === "up-to-date") {
    console.log("Already up to date.");
    return true;
  }
  const { counts } = result;
  console.log(
    [
      `Ledger: ${counts.ledger} new, ${counts.inKind} marked in kind`,
      `Instruments: ${counts.newInstruments} new, ${counts.changedInstruments} changed`,
      `Plan versions: ${counts.newTargets} new, ${counts.deletedTargets} deleted`,
      `Compositions: ${counts.newHoldings} new, ${counts.replacedHoldings} replaced`,
      `Identities: ${counts.newIdentities} new, ${counts.updatedIdentities} updated`,
      `Settings: ${counts.settings ? "changed" : "unchanged"}`,
    ].join("\n"),
  );

  if (result.status === "conflicts") {
    console.error(
      `\n${result.plan.conflicts.length} conflict(s); nothing was written:`,
    );
    for (const conflict of result.plan.conflicts) {
      console.error(`  ${describeConflict(conflict)}`);
    }
    return false;
  }

  if (result.status === "dry-run") {
    console.log("\nDry run: nothing was written.");
    if (result.plan.effects.length > 0) console.log("Afterwards it would:");
    for (const effect of result.plan.effects)
      console.log(`  ${describeEffect(effect)}`);
    return true;
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
  return failed.length === 0;
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [file, ...rest] = args.filter((arg) => arg !== "--dry-run");
  if (!file || rest.length > 0) {
    console.error(USAGE);
    exit(1);
  }

  const target = announceDatabase();
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));

  const result = await importSync(raw, {
    dryRun,
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
      error instanceof SameDeviceError
    ) {
      console.error(error.message);
    } else {
      console.error("\nSync import stopped:", describeFailure(error));
    }
    exit(1);
  })
  .finally(() => prisma.$disconnect());
