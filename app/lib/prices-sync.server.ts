import { YahooMarketDataProvider } from "~/adapters/marketdata";
import {
  PrismaInstrumentRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import type {
  InstrumentRepository,
  MarketDataProvider,
  PriceRepository,
} from "~/core/ports";

import { planPriceSync, type PriceSyncPlan } from "./prices-sync";

export interface SyncPricesDeps {
  instruments: InstrumentRepository;
  prices: PriceRepository;
  provider: MarketDataProvider;
  now?: Date;
}

export interface PriceSyncResult extends PriceSyncPlan {
  updated: number;
}

export async function syncPrices(
  deps: SyncPricesDeps = defaultDeps(),
): Promise<PriceSyncResult> {
  const instruments = await deps.instruments.list();
  const symbols = [
    ...new Set(
      instruments.map((i) => i.quoteSymbol).filter((s): s is string => !!s),
    ),
  ];

  const quotes =
    symbols.length > 0 ? await deps.provider.getQuotes(symbols) : [];

  const plan = planPriceSync(
    instruments,
    quotes,
    deps.provider.source,
    deps.now ?? new Date(),
  );

  const updated =
    plan.snapshots.length > 0 ? await deps.prices.saveMany(plan.snapshots) : 0;

  return { ...plan, updated };
}

export function defaultDeps(): SyncPricesDeps {
  return {
    instruments: new PrismaInstrumentRepository(),
    prices: new PrismaPriceRepository(),
    provider: new YahooMarketDataProvider(),
  };
}
