import { dayOf, shiftDay } from "~/core/calendar";
import { BASE_CURRENCY } from "~/core/domain";
import type { RateBook } from "~/core/fx";
import type {
  FxRate,
  FxRateProvider,
  FxRepository,
  FxSeries,
} from "~/core/ports";

export const FIRST_USE_MARGIN_DAYS = 7;
export const UNUSED_LOOKBACK_DAYS = 30;

export interface FxSyncDeps {
  repository: Pick<
    FxRepository,
    "save" | "firstDay" | "lastDay" | "markChecked"
  >;
  provider: FxRateProvider;
  currencies: readonly string[];
  firstUse: ReadonlyMap<string, string>;
  now?: Date;
}

export type FxSyncOutcome =
  | {
      quote: string;
      status: "written";
      from: string;
      inserted: number;
      unchanged: number;
      lastDay: string | null;
    }
  | {
      quote: string;
      status: "conflict";
      conflicts: { stored: FxRate; incoming: FxRate }[];
    }
  | { quote: string; status: "unavailable"; error: unknown };

export interface FxSyncResult {
  outcomes: FxSyncOutcome[];
  inserted: number;
  conflicted: string[];
  unavailable: string[];
}

export function firstUseByCurrency(
  uses: Iterable<{ currency: string; at: Date }>,
): Map<string, string> {
  const first = new Map<string, string>();
  for (const { currency, at } of uses) {
    if (currency === BASE_CURRENCY) continue;
    const day = dayOf(at);
    const held = first.get(currency);
    if (held === undefined || day < held) first.set(currency, day);
  }
  return new Map([...first].sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function syncStart(
  needed: string,
  firstUse: string | null,
  stored: { first: string | null; last: string | null },
): string {
  if (stored.first === null || stored.last === null) return needed;
  if (firstUse !== null && firstUse < stored.first) return needed;
  return stored.last;
}

export async function syncFxRates(deps: FxSyncDeps): Promise<FxSyncResult> {
  const { repository, provider } = deps;
  const today = dayOf(deps.now ?? new Date());
  const outcomes: FxSyncOutcome[] = [];

  for (const quote of deps.currencies) {
    const series: FxSeries = {
      source: provider.source,
      base: provider.base,
      quote,
    };
    const used = deps.firstUse.get(quote);
    const needed = used
      ? shiftDay(used, -FIRST_USE_MARGIN_DAYS)
      : shiftDay(today, -UNUSED_LOOKBACK_DAYS);
    const from = syncStart(needed, used ?? null, {
      first: await repository.firstDay(series),
      last: await repository.lastDay(series),
    });

    let rates: FxRate[];
    try {
      rates = await provider.getRates(quote, from, today);
    } catch (error) {
      outcomes.push({ quote, status: "unavailable", error });
      continue;
    }
    await repository.markChecked(series);

    const saved = await repository.save(series, rates);
    if (saved.conflicts.length > 0) {
      outcomes.push({ quote, status: "conflict", conflicts: saved.conflicts });
      continue;
    }
    outcomes.push({
      quote,
      status: "written",
      from,
      inserted: saved.inserted,
      unchanged: saved.unchanged,
      lastDay: await repository.lastDay(series),
    });
  }

  return {
    outcomes,
    inserted: outcomes.reduce(
      (sum, o) => sum + (o.status === "written" ? o.inserted : 0),
      0,
    ),
    conflicted: outcomes
      .filter((o) => o.status === "conflict")
      .map((o) => o.quote),
    unavailable: outcomes
      .filter((o) => o.status === "unavailable")
      .map((o) => o.quote),
  };
}

export interface EnsuredRates {
  book: RateBook;
  unavailable: string[];
}

export type EnsureRates = (
  needs: ReadonlyMap<string, string>,
) => Promise<EnsuredRates>;

export interface EnsureRatesDeps {
  repository: Pick<
    FxRepository,
    "save" | "firstDay" | "lastDay" | "markChecked" | "book"
  >;
  provider: FxRateProvider;
  now?: Date;
}

export async function ensureRates(
  deps: EnsureRatesDeps,
  needs: ReadonlyMap<string, string>,
): Promise<EnsuredRates> {
  const currencies = [...needs.keys()]
    .filter((currency) => currency !== BASE_CURRENCY)
    .sort();
  if (currencies.length === 0) return { book: new Map(), unavailable: [] };

  const { unavailable } = await syncFxRates({
    repository: deps.repository,
    provider: deps.provider,
    currencies,
    firstUse: needs,
    ...(deps.now ? { now: deps.now } : {}),
  });
  return {
    book: await deps.repository.book(deps.provider.source, currencies),
    unavailable,
  };
}

export type RateSeries = "base" | "published" | "none" | "unavailable";

export function rateSeriesOf(
  ensured: EnsuredRates,
  currency: string,
): RateSeries {
  if (currency === BASE_CURRENCY) return "base";
  if ((ensured.book.get(currency)?.length ?? 0) > 0) return "published";
  return ensured.unavailable.includes(currency) ? "unavailable" : "none";
}
