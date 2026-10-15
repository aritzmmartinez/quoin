import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";

import {
  syncInstrumentPrices,
  toSyncTargets,
  type InstrumentSync,
  type SyncDeps,
} from "./prices-sync";

export function defaultDeps(): SyncDeps {
  return {
    prices: new PrismaPriceRepository(),
    provider: new YahooMarketDataProvider(),
  };
}

export async function syncTargets() {
  return toSyncTargets(await new PrismaInstrumentRepository().list());
}

export async function syncInstrument(
  instrumentId: string,
  deps: SyncDeps = defaultDeps(),
): Promise<InstrumentSync | null> {
  const instrument = await new PrismaInstrumentRepository().get(instrumentId);
  const [target] = instrument ? toSyncTargets([instrument]).targets : [];
  return target ? syncInstrumentPrices(deps, target) : null;
}
