import { IneInflationProvider, SERIES_IDS } from "~/adapters/inflation";
import { PrismaInflationRepository } from "~/adapters/persistence";

import {
  syncInflation,
  type InflationSyncDeps,
  type InflationSyncResult,
} from "./ipc-sync";

export function defaultInflationSyncDeps(): InflationSyncDeps {
  return {
    repository: new PrismaInflationRepository(),
    provider: new IneInflationProvider(),
    series: SERIES_IDS,
  };
}

export function runInflationSync(): Promise<InflationSyncResult> {
  return syncInflation(defaultInflationSyncDeps());
}
