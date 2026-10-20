import { EcbFxRateProvider } from "~/adapters/fx";
import {
  PrismaFxRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";

import { currenciesInUse, syncFxRates, type FxSyncResult } from "./fx-sync";

export async function usedCurrencies(): Promise<string[]> {
  const [events, prices] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaPriceRepository().latest(),
  ]);
  return currenciesInUse([
    ...events.map((event) => event.currency),
    ...[...prices.values()].map((snapshot) => snapshot.currency),
  ]);
}

export async function runFxSync(
  currencies?: readonly string[],
): Promise<FxSyncResult> {
  return syncFxRates({
    repository: new PrismaFxRepository(),
    provider: new EcbFxRateProvider(),
    currencies: currencies ?? (await usedCurrencies()),
  });
}
