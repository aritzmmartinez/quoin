import { dayOf } from "~/core/calendar";
import { BASE_CURRENCY } from "~/core/domain";
import type {
  FxRate,
  FxRateProvider,
  FxRepository,
  FxSeries,
} from "~/core/ports";

export const FIRST_ECB_DAY = "1999-01-04";

export interface FxSyncDeps {
  repository: Pick<FxRepository, "save" | "lastDay" | "markChecked">;
  provider: FxRateProvider;
  currencies: readonly string[];
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

export function currenciesInUse(currencies: Iterable<string>): string[] {
  return [...new Set(currencies)]
    .filter((currency) => currency !== BASE_CURRENCY)
    .sort();
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
    const from = (await repository.lastDay(series)) ?? FIRST_ECB_DAY;

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
