import { isFreshQuote } from "~/adapters/marketdata";
import { dayOf, shiftDay } from "~/core/calendar";
import { foreignCurrency, type Instrument } from "~/core/domain";
import type {
  MarketDataProvider,
  PriceRepository,
  PriceSnapshot,
  Quote,
} from "~/core/ports";
import { liveSource } from "~/core/prices";

import type { Copy } from "./i18n";

export const SYNC_OVERLAP_DAYS = 7;

const DAY_MS = 86_400_000;

export interface SyncTarget {
  id: string;
  name: string;
  quoteSymbol: string;
}

export interface UnmappedInstrument {
  instrumentId: string;
  name: string;
}

export function toSyncTargets(
  instruments: readonly Pick<Instrument, "id" | "name" | "quoteSymbol">[],
): { targets: SyncTarget[]; unmapped: UnmappedInstrument[] } {
  const targets: SyncTarget[] = [];
  const unmapped: UnmappedInstrument[] = [];
  for (const { id, name, quoteSymbol } of instruments) {
    if (quoteSymbol) targets.push({ id, name, quoteSymbol });
    else unmapped.push({ instrumentId: id, name });
  }
  return { targets, unmapped };
}

export type SyncProblem = "no-quote" | "stale" | "not-eur" | "error";

export interface InstrumentSync {
  instrumentId: string;
  name: string;
  inserted: number;
  corrected: number;
  live: boolean;
  problem: SyncProblem | null;
}

export interface SyncDeps {
  prices: PriceRepository;
  provider: MarketDataProvider;
  now?: Date;
}

function toSnapshot(
  instrumentId: string,
  quote: Quote,
  source: string,
): PriceSnapshot {
  return {
    instrumentId,
    price: quote.price,
    currency: quote.currency,
    asOf: quote.asOf,
    source,
  };
}

async function gapCandles(
  deps: SyncDeps,
  target: SyncTarget,
  now: Date,
): Promise<Quote[]> {
  const last = await deps.prices.lastAsOf(target.id);
  if (!last) return [];
  const from = shiftDay(dayOf(last), -SYNC_OVERLAP_DAYS);
  const yesterday = shiftDay(dayOf(now), -1);
  if (from > yesterday) return [];
  const history = await deps.provider.getHistory(target.quoteSymbol, {
    from: new Date(last.getTime() - (SYNC_OVERLAP_DAYS + 1) * DAY_MS),
    to: now,
  });
  return history.filter((quote) => {
    const day = dayOf(quote.asOf);
    return day >= from && day <= yesterday;
  });
}

export async function syncInstrumentPrices(
  deps: SyncDeps,
  target: SyncTarget,
): Promise<InstrumentSync> {
  const now = deps.now ?? new Date();
  const { provider } = deps;
  const result = (
    written: { inserted: number; corrected: number; live: boolean },
    problem: SyncProblem | null,
  ): InstrumentSync => ({
    instrumentId: target.id,
    name: target.name,
    ...written,
    problem,
  });

  const candles = await gapCandles(deps, target, now);
  if (foreignCurrency(candles)) {
    return result({ inserted: 0, corrected: 0, live: false }, "not-eur");
  }

  const quote = (await provider.getQuotes([target.quoteSymbol])).find(
    (q) => q.symbol === target.quoteSymbol,
  );
  let problem: SyncProblem | null = null;
  let live: PriceSnapshot | null = null;
  if (!quote) problem = "no-quote";
  else if (foreignCurrency([quote])) problem = "not-eur";
  else if (!isFreshQuote(quote, now)) problem = "stale";
  else live = toSnapshot(target.id, quote, liveSource(provider.source));

  const written = await deps.prices.saveDaily(
    target.id,
    candles.map((c) => toSnapshot(target.id, c, provider.source)),
    live,
  );
  return result(written, problem);
}

export function failedSync(target: Pick<SyncTarget, "id" | "name">): InstrumentSync {
  return {
    instrumentId: target.id,
    name: target.name,
    inserted: 0,
    corrected: 0,
    live: false,
    problem: "error",
  };
}

export function splitUnmapped(
  unmapped: readonly UnmappedInstrument[],
  openIds: ReadonlySet<string>,
): { open: number; closed: number } {
  const open = unmapped.filter((u) => openIds.has(u.instrumentId)).length;
  return { open, closed: unmapped.length - open };
}

export interface PriceSyncToast {
  message: string;
  description?: string;
  failures: { name: string; reason: string }[];
}

export function priceSyncToast(
  t: Copy,
  steps: readonly InstrumentSync[],
  unmapped: { open: number; closed: number },
): PriceSyncToast {
  const copy = t.instruments.sync;
  const failures = steps.flatMap((step) =>
    step.problem ? [{ name: step.name, reason: copy.problem[step.problem] }] : [],
  );
  const inserted = steps.reduce((sum, step) => sum + step.inserted, 0);

  const unmappedParts = [
    unmapped.open > 0 ? copy.unmappedOpen(unmapped.open) : null,
    unmapped.closed > 0 ? copy.unmappedClosed(unmapped.closed) : null,
  ].filter((part): part is string => part !== null);
  const description = [
    inserted > 0 ? copy.candles(inserted) : null,
    unmappedParts.length > 0
      ? `${unmappedParts.join(" · ")}. ${copy.unmappedAction}`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(". ");

  const message =
    steps.length === 0
      ? copy.nothing
      : copy.done(steps.length - failures.length, steps.length);

  return description === ""
    ? { message, failures }
    : { message, description, failures };
}
