import type { SeriesId } from "~/adapters/inflation";
import type { InflationPoint, InflationRepository } from "~/core/ports";

import type { Copy } from "./i18n";

export interface InflationSyncDeps {
  repository: Pick<InflationRepository, "list" | "saveMany" | "markChecked">;
  provider: {
    source: string;
    getSeries(series: SeriesId): Promise<InflationPoint[]>;
  };
  series: readonly SeriesId[];
}

export type SeriesSyncOutcome =
  | {
      series: SeriesId;
      status: "written";
      base: string;
      monthCount: number;
      added: number;
      gaps: string[];
    }
  | {
      series: SeriesId;
      status: "rebase-blocked";
      storedBases: string[];
      incomingBase: string;
      storedCount: number;
    };

export interface InflationSyncResult {
  outcomes: SeriesSyncOutcome[];
  written: number;
  rebaseBlocked: SeriesId[];
}

export async function syncInflation(
  deps: InflationSyncDeps,
): Promise<InflationSyncResult> {
  const outcomes: SeriesSyncOutcome[] = [];
  let written = 0;

  for (const series of deps.series) {
    const incoming = await deps.provider.getSeries(series);
    await deps.repository.markChecked(series);

    const base = incoming[0]!.base;
    const stored = await deps.repository.list(series);
    const storedBases = [...new Set(stored.map((p) => p.base))].sort();
    const rebased =
      storedBases.length > 0 && storedBases.some((b) => b !== base);

    if (rebased) {
      outcomes.push({
        series,
        status: "rebase-blocked",
        storedBases,
        incomingBase: base,
        storedCount: stored.length,
      });
      continue;
    }

    const count = await deps.repository.saveMany(incoming);
    written += count;
    outcomes.push({
      series,
      status: "written",
      base,
      monthCount: count,
      added: count - stored.length,
      gaps: gapsIn(incoming),
    });
  }

  return {
    outcomes,
    written,
    rebaseBlocked: outcomes
      .filter((o) => o.status === "rebase-blocked")
      .map((o) => o.series),
  };
}

export interface IpcSyncCounts {
  added: number;
  rebaseBlocked: readonly string[];
}

export interface IpcSyncToast {
  message: string;
  description?: string;
}

export function ipcSyncToast(t: Copy, counts: IpcSyncCounts): IpcSyncToast {
  const copy = t.basis.sync;
  const message = counts.added > 0 ? copy.added(counts.added) : copy.upToDate;

  if (counts.rebaseBlocked.length === 0) return { message };
  return {
    message,
    description: counts.rebaseBlocked.map((s) => copy.rebase(s)).join(" · "),
  };
}

export function gapsIn(points: readonly InflationPoint[]): string[] {
  if (points.length === 0) return [];
  const present = new Set(points.map((p) => p.period));
  const sorted = [...present].sort();
  const [first, last] = [sorted[0]!, sorted[sorted.length - 1]!];

  const gaps: string[] = [];
  let [year, month] = first.split("-").map(Number) as [number, number];
  for (;;) {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    if (period > last) break;
    if (!present.has(period)) gaps.push(period);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return gaps;
}
