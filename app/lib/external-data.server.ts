import { ECB_BASE, ECB_SOURCE } from "~/adapters/fx";
import {
  PrismaFxRepository,
  PrismaInflationRepository,
  PrismaPriceSyncRepository,
} from "~/adapters/persistence";
import {
  InflationIndex,
  type Instrument,
  type LedgerEvent,
} from "~/core/domain";
import type { PriceSnapshot } from "~/core/ports";
import { computePositions } from "~/core/projections";

import {
  inflationStatus,
  pricesStatus,
  ratesStatus,
  type SourceStatus,
} from "./external-data";
import { firstUses } from "./fx-sync.server";
import { findBenchmark } from "./opportunity-cost";
import { splitUnmapped, toSyncTargets } from "./prices-sync";
import { DEFAULT_INFLATION_SERIES } from "./real.server";
import { loadResidence } from "./residence.server";
import { openInstrumentIds } from "./unrated";

export interface ExternalData {
  prices: SourceStatus;
  inflation: SourceStatus;
  rates: SourceStatus & { currencies: string[] };
  syncTargets: { id: string; name: string }[];
  unmapped: { open: number; closed: number };
}

export async function loadExternalData(
  instruments: readonly Instrument[],
  events: readonly LedgerEvent[],
  latest: ReadonlyMap<string, PriceSnapshot>,
  benchmarkSymbol: string,
): Promise<ExternalData> {
  const { jurisdiction } = await loadResidence();
  const open = new Set(
    openInstrumentIds(computePositions(events, jurisdiction)),
  );
  const benchmark = findBenchmark(instruments, benchmarkSymbol);
  const relevant = instruments
    .filter((i) => i.quoteSymbol && (open.has(i.id) || i.id === benchmark?.id))
    .map(({ id, name }) => ({ id, name }));

  const fx = new PrismaFxRepository();
  const inflation = new PrismaInflationRepository();
  const [checked, points, inflationChecked, uses] = await Promise.all([
    new PrismaPriceSyncRepository().lastChecked(),
    inflation.list(DEFAULT_INFLATION_SERIES),
    inflation.lastSyncedAt(DEFAULT_INFLATION_SERIES),
    firstUses(),
  ]);
  const currencies = [...uses.keys()];
  const series = await Promise.all(
    currencies.map(async (currency) => {
      const key = { source: ECB_SOURCE, base: ECB_BASE, quote: currency };
      return {
        currency,
        lastDay: await fx.lastDay(key),
        lastChecked: await fx.lastSyncedAt(key),
      };
    }),
  );

  const { targets, unmapped } = toSyncTargets(instruments);
  return {
    prices: pricesStatus({
      relevant,
      latest,
      checked,
      zone: jurisdiction.zone,
    }),
    inflation: inflationStatus(
      InflationIndex.from(DEFAULT_INFLATION_SERIES, points).latestPeriod(),
      inflationChecked,
    ),
    rates: { ...ratesStatus(series), currencies },
    syncTargets: targets.map(({ id, name }) => ({ id, name })),
    unmapped: splitUnmapped(unmapped, open),
  };
}
