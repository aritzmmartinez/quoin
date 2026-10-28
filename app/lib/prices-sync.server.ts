import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
  PrismaPriceSyncRepository,
} from "~/adapters/persistence";

import {
  syncInstrumentPrices,
  toSyncTargets,
  type InstrumentSync,
  type SyncDeps,
} from "./prices-sync";
import { loadResidence } from "./residence.server";

export async function defaultDeps(): Promise<SyncDeps> {
  const { calendarZone } = await loadResidence();
  return {
    prices: new PrismaPriceRepository(),
    provider: new YahooMarketDataProvider(),
    checks: new PrismaPriceSyncRepository(),
    zone: calendarZone,
  };
}

export async function syncTargets() {
  return toSyncTargets(await new PrismaInstrumentRepository().list());
}

export async function syncInstrument(
  instrumentId: string,
  deps?: SyncDeps,
): Promise<InstrumentSync | null> {
  const instrument = await new PrismaInstrumentRepository().get(instrumentId);
  const [target] = instrument ? toSyncTargets([instrument]).targets : [];
  return target
    ? syncInstrumentPrices(deps ?? (await defaultDeps()), target)
    : null;
}
