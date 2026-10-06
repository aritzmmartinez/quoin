import "dotenv/config";

import Decimal from "decimal.js";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  prisma,
} from "~/adapters/persistence";
import { toCalendarDate, toIsoDate } from "~/core/calendar";
import { Money } from "~/core/domain";
import {
  FISCAL_TIME_ZONE,
  WASH_SALE_WINDOW_MONTHS,
  carryforwardFrom,
  computeSavingsQuota,
  computeTaxHistory,
  getTaxScale,
  taxYearOf,
  type RealizedGainDetail,
} from "~/core/tax";
import { unlistedInstrumentIds } from "~/lib/tax";
import { databasePath } from "./lib/db-target";

const YEAR = Number(
  process.argv.find((a) => /^\d{4}$/.test(a)) ??
    process.argv.find((a) => a.startsWith("--year="))?.slice("--year=".length),
);

if (!Number.isInteger(YEAR)) {
  console.error("Usage: pnpm tax:explain <year>   e.g. pnpm tax:explain 2025");
  process.exit(1);
}

function eur(value: string): string {
  return new Decimal(value).toFixed(2).padStart(12);
}

function day(t: Date): string {
  return toIsoDate(toCalendarDate(t, FISCAL_TIME_ZONE));
}

function printSale(gain: RealizedGainDetail, names: Map<string, string>): void {
  const name = names.get(gain.instrumentId) ?? gain.instrumentId;
  const flag = gain.washSale
    ? "  <-- ART. 43 REPURCHASE"
    : gain.unlistedNotice
      ? "  <-- NOTE (unlisted)"
      : "";
  console.log(
    `  ${day(gain.ts)}  ${gain.instrumentId.padEnd(14)} qty ${gain.quantity.padStart(12)}` +
      `  gross ${eur(gain.grossAmount)}  fees ${eur(gain.fees)}  cost ${eur(gain.costBasis)}` +
      `  pnl ${eur(gain.realizedPnL)}  ${name}${flag}`,
  );

  const ws = gain.washSale;
  if (ws) {
    console.log(
      `      window: [${toIsoDate(ws.window.start)} .. ${toIsoDate(ws.window.end)}]  (sale ± ${WASH_SALE_WINDOW_MONTHS}m, Madrid)`,
    );
    console.log(
      `      before ${ws.before}  R ${ws.remainingAfter}  repurchase_before ${ws.repurchaseBefore}` +
        `  repurchase_after ${ws.repurchaseAfter}  repurchased ${ws.repurchased} of ${gain.quantity}`,
    );
    console.log(
      `      non-computable fraction ${new Decimal(ws.fraction).toFixed(6)}` +
        `  own non-computable ${eur(gain.nonComputable)}  computable ${eur(gain.computablePnL)}` +
        (gain.carriedOver !== "0"
          ? `  inherited deferral moved on ${eur(gain.carriedOver)}`
          : ""),
    );
    for (const r of ws.recipients) {
      console.log(
        `      -> recipient ${r.buyEventId.padEnd(14)} acquired ${day(r.acquiredAt)}` +
          `  qty ${r.quantity.padStart(12)}  deferred ${eur(r.deferredLoss)}`,
      );
    }
  }
  if (gain.unlistedNotice) {
    console.log(
      `      outside Art. 43 (not admitted to trading); acquired again ${day(gain.unlistedNotice.buyTs)}` +
        ` (${gain.unlistedNotice.buyEventId}) — informative only, nothing changes`,
    );
  }
  for (const lot of gain.lots) {
    console.log(
      `      lot ${lot.buyEventId.padEnd(14)} acquired ${day(lot.acquiredAt)}` +
        `  qty ${lot.quantity.padStart(12)}  unit cost ${new Decimal(lot.unitCost).toFixed(4).padStart(10)}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`Database: ${databasePath() ?? "(unset)"}\n`);

  const [events, instruments] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
  ]);
  const names = new Map(instruments.map((i) => [i.id, i.name]));

  const history = computeTaxHistory(events, {
    unlistedInstrumentIds: unlistedInstrumentIds(instruments),
  });
  const saleDays = new Map(history.gains.map((g) => [g.eventId, day(g.ts)]));
  const result = taxYearOf(history, YEAR);

  console.log(`Fiscal year ${result.year} — territory: ${result.territory}\n`);

  if (result.gains.length === 0) {
    console.log("No sales fell in this fiscal year.");
  } else {
    console.log(`Sales (${result.gains.length}), FIFO:\n`);
    for (const gain of result.gains) printSale(gain, names);
  }

  if (result.integrations.length > 0) {
    console.log(`\nDeferred losses that compute in ${YEAR}:\n`);
    for (const i of result.integrations) {
      console.log(
        `  ${day(i.ts)}  ${i.instrumentId.padEnd(14)} sale ${i.integratedByEventId.padEnd(14)}` +
          `  from loss of ${day(i.originTs)} (${i.originEventId})  ${eur(i.amount)}`,
      );
    }
  }

  const sum = (values: string[]): string =>
    values.reduce((acc, v) => acc.plus(v), new Decimal(0)).toFixed();
  const ownNet = sum(result.gains.map((g) => g.realizedPnL));
  const nonComputable = sum(result.gains.map((g) => g.nonComputable));
  const integrated = sum(result.integrations.map((i) => i.amount));
  const affected = result.gains.filter((g) => g.washSale).length;

  console.log(
    `\nOwn-year result of the sales:            ${eur(ownNet)}` +
      `  (${result.gains.length} sales, ${affected} with an Art. 43 repurchase)`,
  );
  console.log(`Non-computable, deferred (Art. 43):      ${eur(nonComputable)}`);
  console.log(`Deferred losses computing this year:     ${eur(integrated)}`);
  console.log(
    `Computable net for the year:             ${eur(result.computableNet)}\n`,
  );

  if (result.pending.length > 0) {
    console.log(`Deferred losses still pending at 31-12-${YEAR}:\n`);
    for (const p of result.pending) {
      for (const piece of p.pieces) {
        console.log(
          `  units ${p.buyEventId.padEnd(14)} acquired ${day(p.acquiredAt)}  ${p.instrumentId.padEnd(14)}` +
            `  from loss of ${saleDays.get(piece.originEventId) ?? "?"} (${piece.originEventId})  ${eur(piece.amount)}`,
        );
      }
    }
    console.log("");
  }

  const carry = carryforwardFrom(history, YEAR);
  console.log(
    `Carryforward chain, ${carry.steps[0]!.year}..${YEAR} (max 4 prior years):\n`,
  );
  console.log(
    "year   ownNet          consumedFromCarry   finalNet        pendingLossRemaining",
  );
  for (const step of carry.steps) {
    console.log(
      `${step.year}  ${eur(step.ownNet)}   ${eur(step.consumedFromCarryforward)}` +
        `      ${eur(step.finalNet)}   ${eur(step.pendingLossRemaining)}`,
    );
  }

  console.log(`\nNet savings base for ${YEAR}: ${eur(carry.netSavingsBase)}`);

  const scale = getTaxScale(result.territory, YEAR);
  if (!scale) {
    console.log(
      `\nNo tax scale on file for ${result.territory} ${YEAR} — cannot compute quota.`,
    );
    return;
  }

  const netBase = new Decimal(carry.netSavingsBase);
  const quota = netBase.isPositive()
    ? computeSavingsQuota(Money.fromString(carry.netSavingsBase), scale)
    : Money.zero();

  console.log(`Scale in force: ${scale.source}`);
  console.log(`Quota: ${eur(quota.toString())} EUR`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
