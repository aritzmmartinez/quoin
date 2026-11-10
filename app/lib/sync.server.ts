import { hostname } from "node:os";

import { SqliteSyncStore } from "~/adapters/persistence";
import { dayOf } from "~/core/calendar";
import type { Effect, Exchange, Resolutions } from "~/core/sync";

import { rateSeriesOf } from "./fx-sync";
import { ensureRatesNow } from "./fx-sync.server";
import { replaceHistory } from "./ingest.server";
import { DEFAULT_HISTORY_RANGE } from "./prices-backfill";
import { isUnsupportedResidence, UNSUPPORTED_RESIDENCE } from "./residence";
import { loadResidence } from "./residence.server";
import {
  exportState,
  importState,
  type EffectOutcome,
  type ImportResult,
} from "./sync";

export const inDocker = () => process.env.QUOIN_RUNTIME === "docker";

export const defaultServerName = () => (inDocker() ? "Quoin" : hostname());

export async function exportSync(): Promise<Exchange> {
  const store = new SqliteSyncStore();
  try {
    return await exportState(store, new Date(), defaultServerName());
  } finally {
    store.close();
  }
}

export async function runEffect(effect: Effect): Promise<EffectOutcome> {
  try {
    return await attemptEffect(effect);
  } catch (error) {
    if (!isUnsupportedResidence(error)) throw error;
    return { effect, ok: false, reason: UNSUPPORTED_RESIDENCE };
  }
}

async function attemptEffect(effect: Effect): Promise<EffectOutcome> {
  if (effect.kind === "prices") {
    const outcome = await replaceHistory(
      effect.instrumentId,
      effect.symbol,
      DEFAULT_HISTORY_RANGE,
    );
    return outcome.ok
      ? { effect, ok: true }
      : { effect, ok: false, reason: outcome.reason };
  }

  const { calendarZone } = await loadResidence();
  const since = dayOf(new Date(effect.since), calendarZone);
  const series = rateSeriesOf(
    await ensureRatesNow(new Map([[effect.currency, since]])),
    effect.currency,
  );
  return series === "published" || series === "base"
    ? { effect, ok: true }
    : {
        effect,
        ok: false,
        reason: series === "none" ? "no-rate-series" : "rates-unavailable",
      };
}

export async function importSync(
  raw: unknown,
  options: {
    dryRun: boolean;
    resolutions?: Resolutions;
    beforeApply?: () => void;
  },
): Promise<ImportResult> {
  const store = new SqliteSyncStore();
  try {
    return await importState(
      {
        store,
        runEffect,
        ...(options.beforeApply ? { beforeApply: options.beforeApply } : {}),
        now: new Date(),
      },
      raw,
      {
        dryRun: options.dryRun,
        ...(options.resolutions ? { resolutions: options.resolutions } : {}),
      },
    );
  } finally {
    store.close();
  }
}
