import "dotenv/config";

import Decimal from "decimal.js";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  prisma,
} from "~/adapters/persistence";
import { Money } from "~/core/domain";
import type { LedgerEvent, TradeEvent } from "~/core/domain";
import {
  WASH_SALE_WINDOW_MONTHS,
  computeNetWithCarryforward,
  computeSavingsQuota,
  computeTaxLots,
  getTaxScale,
  type RealizedGainDetail,
} from "~/core/tax";
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
  return t.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function printSale(
  gain: RealizedGainDetail,
  names: Map<string, string>,
  tradesById: Map<string, TradeEvent>,
): void {
  const name = names.get(gain.instrumentId) ?? gain.instrumentId;
  const flag = gain.disallowed ? "  <-- WASH-SALE DISALLOWED" : "";
  console.log(
    `  ${day(gain.ts)}  ${gain.instrumentId.padEnd(14)} qty ${gain.quantity.padStart(12)}` +
      `  gross ${eur(gain.grossAmount)}  fees ${eur(gain.fees)}  cost ${eur(gain.costBasis)}` +
      `  pnl ${eur(gain.realizedPnL)}  ${name}${flag}`,
  );
  if (gain.disallowed) {
    const windowStart = addMonths(gain.ts, -WASH_SALE_WINDOW_MONTHS);
    const windowEnd = addMonths(gain.ts, WASH_SALE_WINDOW_MONTHS);
    console.log(`      reason: ${gain.disallowedReason}`);
    console.log(
      `      window: [${day(windowStart)} .. ${day(windowEnd)}]  (sale ± ${WASH_SALE_WINDOW_MONTHS}m)`,
    );
    const trigger = gain.disallowedByBuyEventId
      ? tradesById.get(gain.disallowedByBuyEventId)
      : undefined;
    console.log(
      `      repurchase event: ${gain.disallowedByBuyEventId ?? "?"}` +
        (trigger
          ? `  on ${day(trigger.ts)}`
          : "  (ts not found in ledger dump)"),
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
  const tradesById = new Map(
    events
      .filter(
        (e: LedgerEvent): e is TradeEvent =>
          e.type === "BUY" || e.type === "SELL",
      )
      .map((t) => [t.id, t]),
  );

  const result = computeTaxLots(events, YEAR);

  console.log(`Fiscal year ${result.year} — territory: ${result.territory}\n`);

  if (result.gains.length === 0) {
    console.log("No sales fell in this fiscal year.");
  } else {
    console.log(`Sales (${result.gains.length}), FIFO:\n`);
    for (const gain of result.gains) printSale(gain, names, tradesById);
  }

  const allowed = result.gains.filter((g) => !g.disallowed);
  const disallowed = result.gains.filter((g) => g.disallowed);
  const grossNet = result.gains.reduce(
    (sum, g) => sum.plus(g.realizedPnL),
    new Decimal(0),
  );
  const disallowedLoss = disallowed.reduce(
    (sum, g) => sum.plus(g.realizedPnL),
    new Decimal(0),
  );

  console.log(
    `\nOwn-year net before wash-sale exclusion: ${eur(grossNet.toFixed())}` +
      `  (${allowed.length} allowed, ${disallowed.length} disallowed, ` +
      `disallowed sum ${eur(disallowedLoss.toFixed())})`,
  );
  console.log(
    `Own-year net after wash-sale exclusion:  ${eur(result.allowedNet)}\n`,
  );

  const carry = computeNetWithCarryforward(events, YEAR);
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
