import { EcbFxRateProvider } from "~/adapters/fx";
import {
  PrismaFxRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";

import {
  ensureRates,
  firstUseByCurrency,
  syncFxRates,
  type EnsuredRates,
  type FxSyncResult,
} from "./fx-sync";

export async function firstUses(): Promise<Map<string, string>> {
  const prices = new PrismaPriceRepository();
  const [events, latest] = await Promise.all([
    new PrismaLedgerRepository().list(),
    prices.latest(),
  ]);
  const priced = [...new Set([...latest.values()].map((s) => s.currency))];
  const starts = await Promise.all(
    priced.map(async (currency) => ({
      currency,
      starts: [...(await prices.historyStarts(currency)).values()],
    })),
  );

  return firstUseByCurrency([
    ...events.map((event) => ({ currency: event.currency, at: event.ts })),
    ...starts.flatMap(({ currency, starts }) =>
      starts.map((at) => ({ currency, at })),
    ),
  ]);
}

export async function runFxSync(
  codes?: readonly string[],
): Promise<FxSyncResult> {
  const firstUse = await firstUses();
  return syncFxRates({
    repository: new PrismaFxRepository(),
    provider: new EcbFxRateProvider(),
    currencies: codes ?? [...firstUse.keys()],
    firstUse,
  });
}

export function ensureRatesNow(
  needs: ReadonlyMap<string, string>,
): Promise<EnsuredRates> {
  return ensureRates(
    { repository: new PrismaFxRepository(), provider: new EcbFxRateProvider() },
    needs,
  );
}
