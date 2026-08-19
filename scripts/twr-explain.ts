import "dotenv/config";

import Decimal from "decimal.js";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  prisma,
} from "~/adapters/persistence";
import {
  BASE_CURRENCY,
  type LedgerEvent,
  type TradeEvent,
} from "~/core/domain";
import type { PriceSnapshot } from "~/core/ports";
import {
  computeCostBasisTimeline,
  computeInvestedVsValueSeries,
  computePortfolioInvestedVsValueSeries,
  computePortfolioReturns,
  computePositions,
  explainPortfolioTwr,
  type CostBasisPoint,
  type InvestedVsValuePoint,
  type TwrSubPeriod,
} from "~/core/projections";
import { databasePath } from "./lib/db-target";

const TOP = Number(
  process.argv.find((a) => a.startsWith("--top="))?.slice("--top=".length) ??
    12,
);

const AROUND = process.argv
  .find((a) => a.startsWith("--around="))
  ?.slice("--around=".length);

const DAY_MS = 24 * 60 * 60 * 1000;
const EVIDENCE_DAYS = 5;
const JUMP_FACTOR = 2;

function isTrade(event: LedgerEvent): event is TradeEvent {
  return event.type === "BUY" || event.type === "SELL";
}

function day(t: number): string {
  return new Date(t).toISOString().slice(0, 16).replace("T", " ");
}

function eur(value: string): string {
  return new Decimal(value).toFixed(2).padStart(12);
}

function pct(ratio: string | null): string {
  if (ratio === null) return "        (skip)";
  return `${new Decimal(ratio).minus(1).mul(100).toFixed(2).padStart(11)} %`;
}

function distance(row: TwrSubPeriod): Decimal {
  if (row.ratio === null) return new Decimal(0);
  return new Decimal(row.ratio).minus(1).abs();
}

function tradesInside(
  events: readonly LedgerEvent[],
  row: TwrSubPeriod,
): string {
  const inside = events
    .filter(isTrade)
    .filter((e) => e.ts.getTime() > row.from && e.ts.getTime() <= row.to)
    .map((e) => `${e.type} ${"instrumentId" in e ? e.instrumentId : "?"}`);

  if (inside.length === 0) return "no trades";
  return [...new Set(inside)].join(", ");
}

function link(rows: readonly TwrSubPeriod[]): Decimal | null {
  let factor = new Decimal(1);
  let linked = false;
  for (const row of rows) {
    if (row.ratio === null) continue;
    const ratio = new Decimal(row.ratio);
    if (ratio.lte(0)) return null;
    factor = factor.mul(ratio);
    linked = true;
  }
  return linked ? factor.minus(1) : null;
}

function show(value: Decimal | null): string {
  return value === null ? "(none)" : `${value.mul(100).toFixed(2)} %`;
}

interface Holding {
  id: string;
  name: string;
  history: readonly PriceSnapshot[];
  timeline: readonly CostBasisPoint[];
  series: readonly InvestedVsValuePoint[];
}

function valueAt(
  series: readonly InvestedVsValuePoint[],
  t: number,
): string | null {
  let value: string | null = null;
  for (const point of series) {
    if (point.t > t) break;
    value = point.value;
  }
  return value;
}

function quantityAt(timeline: readonly CostBasisPoint[], t: number): Decimal {
  let quantity = new Decimal(0);
  for (const point of timeline) {
    if (new Date(point.ts).getTime() > t) break;
    quantity = new Decimal(point.quantityAfter);
  }
  return quantity;
}

function openLink(
  ranked: readonly TwrSubPeriod[],
  holdings: readonly Holding[],
  events: readonly LedgerEvent[],
  around: string,
): void {
  const anchor = new Date(around);
  if (Number.isNaN(anchor.getTime())) {
    console.log(`--around=${around} is not a date I can read.`);
    return;
  }

  const dateOnly = !around.includes("T");
  const row = dateOnly
    ? ranked.find(
        (r) =>
          new Date(r.from).toISOString().slice(0, 10) ===
          anchor.toISOString().slice(0, 10),
      )
    : ranked.find(
        (r) => r.from <= anchor.getTime() && r.to >= anchor.getTime(),
      );

  if (!row) {
    console.log(`No sub-period found around ${around}.`);
    return;
  }

  console.log(
    `Link ${day(row.from)} → ${day(row.to)}  (${((row.to - row.from) / DAY_MS).toFixed(2)} days)`,
  );
  console.log(
    `  V_start ${new Decimal(row.startValue).toFixed(2)}` +
      `   flow ${new Decimal(row.flow).toFixed(2)}` +
      `   V_end ${new Decimal(row.endValue).toFixed(2)}` +
      `   return ${pct(row.ratio)}\n`,
  );

  console.log("What the portfolio was made of, at each end:\n");
  console.log(
    "instrument       qty @end        value @start   implied @start" +
      "     value @end     implied @end     factor",
  );

  let startTotal = new Decimal(0);
  let endTotal = new Decimal(0);

  for (const holding of holdings) {
    const startValue = valueAt(holding.series, row.from);
    const endValue = valueAt(holding.series, row.to);
    if (startValue === null && endValue === null) continue;

    const startQty = quantityAt(holding.timeline, row.from);
    const endQty = quantityAt(holding.timeline, row.to);
    const startPrice = startQty.isZero()
      ? null
      : new Decimal(startValue ?? "0").div(startQty);
    const endPrice = endQty.isZero()
      ? null
      : new Decimal(endValue ?? "0").div(endQty);

    startTotal = startTotal.plus(startValue ?? "0");
    endTotal = endTotal.plus(endValue ?? "0");

    const factor =
      startPrice && endPrice && startPrice.gt(0)
        ? `${endPrice.div(startPrice).toFixed(3).padStart(9)}x`
        : "        —";

    console.log(
      `${holding.id.padEnd(14)}${endQty.toFixed(6).padStart(12)}` +
        `${eur(startValue ?? "0")}${(startPrice?.toFixed(4) ?? "—").padStart(17)}` +
        `${eur(endValue ?? "0")}${(endPrice?.toFixed(4) ?? "—").padStart(17)}` +
        `  ${factor}   ${holding.name}`,
    );
  }

  console.log(
    `${"".padEnd(14)}${"".padStart(12)}${eur(startTotal.toString())}` +
      `${"".padStart(17)}${eur(endTotal.toString())}   (sum, must match V_start / V_end)`,
  );

  const window = {
    from: row.from - EVIDENCE_DAYS * DAY_MS,
    to: row.to + EVIDENCE_DAYS * DAY_MS,
  };
  console.log(
    `\nPrice snapshots in the ±${EVIDENCE_DAYS} day window — the evidence for ` +
      `"real move" vs "bad price":\n`,
  );

  for (const holding of holdings) {
    const near = holding.history
      .filter((s) => s.asOf.getTime() >= window.from)
      .filter((s) => s.asOf.getTime() <= window.to)
      .sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
    if (near.length === 0) continue;

    console.log(`  ${holding.id}  ${holding.name}`);
    let previous: Decimal | null = null;
    for (const snapshot of near) {
      const price = new Decimal(snapshot.price);
      const jump =
        previous && previous.gt(0) ? price.div(previous) : new Decimal(1);
      const flag =
        jump.gte(JUMP_FACTOR) || jump.lte(1 / JUMP_FACTOR)
          ? `   <-- ${jump.toFixed(2)}x on the previous close`
          : "";
      console.log(
        `    ${day(snapshot.asOf.getTime())}  ${price.toFixed(4).padStart(12)} ` +
          `${snapshot.currency}  ${snapshot.source.padEnd(16)}${flag}`,
      );
      previous = price;
    }
  }

  const trades = events
    .filter(isTrade)
    .filter(
      (e) => e.ts.getTime() >= window.from && e.ts.getTime() <= window.to,
    );
  console.log(`\nTrades in the same window: ${trades.length}`);
  for (const t of trades) {
    console.log(
      `  ${day(t.ts.getTime())}  ${t.type.padEnd(4)} ${t.instrumentId}  ` +
        `qty ${t.quantity}  gross ${t.grossAmount}`,
    );
  }

  console.log(
    "\nIf an implied price is off by a factor nobody can explain, the fault is " +
      "in the PriceSnapshot, not in the TWR: fix the mapping or the series and " +
      "re-check before applying any floor.",
  );
}

async function main(): Promise<void> {
  console.log(`Database: ${databasePath() ?? "(unset)"}\n`);

  const priceRepository = new PrismaPriceRepository();
  const [events, instruments, prices] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    priceRepository.latest(),
  ]);

  const names = new Map(instruments.map((i) => [i.id, i.name]));
  const positions = computePositions(events);
  const heldIds = [...new Set(positions.map((p) => p.instrumentId))];
  const histories = await Promise.all(
    heldIds.map((id) => priceRepository.historyFor(id)),
  );

  const now = new Date();
  const holdings: Holding[] = heldIds.map((id, index) => {
    const history = (histories[index] ?? []).filter(
      (snapshot) => snapshot.currency === BASE_CURRENCY,
    );
    return {
      id,
      name: names.get(id) ?? id,
      history,
      timeline: computeCostBasisTimeline(events, id),
      series: computeInvestedVsValueSeries(
        events,
        id,
        history.map((snapshot) => ({
          asOf: snapshot.asOf,
          price: snapshot.price,
        })),
        prices.get(id)?.currency === BASE_CURRENCY
          ? (prices.get(id)?.price ?? null)
          : null,
        now,
      ),
    };
  });

  const series = computePortfolioInvestedVsValueSeries(
    holdings.map((holding) => holding.series),
  );

  const returns = computePortfolioReturns(events, series);
  const rows = explainPortfolioTwr(events, series);

  console.log(
    `Instruments traded: ${heldIds.length}` +
      `  |  value points: ${series.length}` +
      `  |  linked sub-periods: ${rows.filter((r) => r.ratio !== null).length}`,
  );
  console.log(`Portfolio TWR: ${returns.twr ?? "(none)"}`);
  console.log(`Portfolio MWR: ${returns.mwr ?? "(none)"}\n`);

  if (rows.length === 0) {
    console.log("No sub-periods: the value series has fewer than two points.");
    return;
  }

  const ranked = [...rows].sort((a, b) => distance(b).comparedTo(distance(a)));

  if (AROUND !== undefined) {
    openLink(ranked, holdings, events, AROUND);
    return;
  }

  console.log(`Worst ${Math.min(TOP, ranked.length)} links, by |ratio − 1|:\n`);
  console.log(
    "from              to                 days   V_start        flow" +
      "         V_end       return   trades inside",
  );
  for (const row of ranked.slice(0, TOP)) {
    const days = ((row.to - row.from) / DAY_MS).toFixed(1).padStart(6);
    console.log(
      `${day(row.from)}  ${day(row.to)}  ${days}  ${eur(row.startValue)}` +
        `  ${eur(row.flow)}  ${eur(row.endValue)}  ${pct(row.ratio)}   ` +
        tradesInside(events, row),
    );
  }

  const first = rows[0]!;
  console.log(
    `\nFirst link starts at ${day(first.from)} with V_start = ` +
      `${new Decimal(first.startValue).toFixed(2)} and returns ${pct(first.ratio)}.`,
  );

  const firstTrade = [...events]
    .filter(isTrade)
    .sort((a, b) => a.ts.getTime() - b.ts.getTime())[0];
  if (firstTrade && "instrumentId" in firstTrade) {
    console.log(
      `First trade in the ledger: ${firstTrade.type} ${firstTrade.instrumentId} ` +
        `(${names.get(firstTrade.instrumentId) ?? "?"}) at ${day(firstTrade.ts.getTime())}.`,
    );
  }

  const peak = rows.reduce(
    (max, row) => Decimal.max(max, new Decimal(row.startValue)),
    new Decimal(0),
  );
  console.log(`\nPeak portfolio value in the series: ${peak.toFixed(2)} EUR`);
  console.log("Where the compound comes from, by size of the denominator:\n");
  console.log(
    "  floor (share of peak)      links below      their compound      TWR without them",
  );

  for (const share of [0.001, 0.005, 0.01, 0.05]) {
    const floor = peak.mul(share);
    const below = rows.filter((r) => new Decimal(r.startValue).lt(floor));
    const kept = rows.filter((r) => new Decimal(r.startValue).gte(floor));
    console.log(
      `  ${(share * 100).toFixed(1).padStart(5)} % = ${floor.toFixed(2).padStart(10)} EUR` +
        `   ${String(below.length).padStart(6)} / ${rows.length}` +
        `      ${show(link(below)).padStart(12)}` +
        `      ${show(link(kept)).padStart(12)}`,
    );
  }

  console.log(
    "\nA large 'their compound' next to a small 'links below' count is the " +
      "artifact: a handful of sub-periods nobody had money in are driving the " +
      "headline figure.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
