import { describe, expect, it } from "vitest";

import type { SeriesId } from "~/adapters/inflation";
import type { InflationPoint } from "~/core/ports";

import { gapsIn, syncInflation, type InflationSyncDeps } from "./ipc-sync";

const point = (
  series: string,
  period: string,
  base = "2025",
): InflationPoint => ({
  series,
  period,
  indexValue: "100.000",
  base,
  source: "INE",
});

interface FakeOpts {
  stored?: Record<string, InflationPoint[]>;
  incoming?: Record<string, InflationPoint[] | Error>;
  series?: readonly SeriesId[];
}

function fakes(opts: FakeOpts = {}) {
  const calls: string[] = [];
  const stored: Record<string, InflationPoint[]> = {
    ES: opts.stored?.ES ?? [],
    BI: opts.stored?.BI ?? [],
  };
  const incoming: Record<string, InflationPoint[] | Error> = {
    ES: opts.incoming?.ES ?? [point("ES", "2026-07"), point("ES", "2026-08")],
    BI: opts.incoming?.BI ?? [point("BI", "2026-07"), point("BI", "2026-08")],
  };

  const deps: InflationSyncDeps = {
    series: opts.series ?? (["ES", "BI"] as SeriesId[]),
    provider: {
      source: "INE",
      getSeries: async (series) => {
        const value = incoming[series];
        if (value instanceof Error) {
          calls.push(`fetch:${series}:throw`);
          throw value;
        }
        calls.push(`fetch:${series}`);
        return value ?? [];
      },
    },
    repository: {
      list: async (series) => {
        calls.push(`list:${series}`);
        return stored[series] ?? [];
      },
      saveMany: async (points) => {
        calls.push(`save:${points[0]?.series ?? "?"}:${points.length}`);
        return points.length;
      },
      markChecked: async (series) => {
        calls.push(`mark:${series}`);
      },
    },
  };

  return { calls, deps };
}

describe("syncInflation", () => {
  it("marks the series checked even when INE returns nothing new", async () => {
    const already = [point("ES", "2026-07"), point("ES", "2026-08")];
    const { calls, deps } = fakes({
      stored: { ES: already, BI: already.map((p) => ({ ...p, series: "BI" })) },
    });

    const result = await syncInflation(deps);

    expect(calls.filter((c) => c.startsWith("mark:"))).toEqual([
      "mark:ES",
      "mark:BI",
    ]);
    expect(result.outcomes.every((o) => o.status === "written")).toBe(true);
    for (const outcome of result.outcomes) {
      if (outcome.status === "written") expect(outcome.added).toBe(0);
    }
  });

  it("marks the series checked before deciding what to do with the data", async () => {
    const { calls, deps } = fakes({ series: ["ES"] as SeriesId[] });

    await syncInflation(deps);

    expect(calls).toEqual(["fetch:ES", "mark:ES", "list:ES", "save:ES:2"]);
  });

  it("skips a rebased series without deleting, but still marks it checked", async () => {
    const { calls, deps } = fakes({
      stored: { ES: [point("ES", "2020-01", "2021")] },
      incoming: { ES: [point("ES", "2026-08", "2025")] },
    });

    const result = await syncInflation(deps);

    expect(calls).toContain("mark:ES");
    expect(calls.some((c) => c.startsWith("save:ES"))).toBe(false);
    expect(result.rebaseBlocked).toEqual(["ES"]);
    const es = result.outcomes.find((o) => o.series === "ES");
    expect(es).toMatchObject({
      status: "rebase-blocked",
      storedBases: ["2021"],
      incomingBase: "2025",
      storedCount: 1,
    });
  });

  it("writes the healthy series when another is rebase-blocked", async () => {
    const { calls, deps } = fakes({
      stored: { ES: [point("ES", "2020-01", "2021")] },
      incoming: {
        ES: [point("ES", "2026-08", "2025")],
        BI: [point("BI", "2026-08")],
      },
    });

    const result = await syncInflation(deps);

    expect(result.rebaseBlocked).toEqual(["ES"]);
    expect(result.written).toBe(1);
    expect(calls).toContain("save:BI:1");
    expect(calls).toContain("mark:BI");
  });

  it("does not mark a series checked when the fetch itself fails", async () => {
    const { calls, deps } = fakes({
      series: ["ES"] as SeriesId[],
      incoming: { ES: new Error("INE returned 503") },
    });

    await expect(syncInflation(deps)).rejects.toThrow("503");
    expect(calls).toEqual(["fetch:ES:throw"]);
    expect(calls).not.toContain("mark:ES");
  });
});

describe("gapsIn", () => {
  it("is empty for a contiguous run", () => {
    expect(gapsIn([point("ES", "2026-01"), point("ES", "2026-02")])).toEqual(
      [],
    );
  });

  it("names the months absent between the ends, across a year boundary", () => {
    expect(
      gapsIn([
        point("ES", "2025-11"),
        point("ES", "2026-01"),
        point("ES", "2026-03"),
      ]),
    ).toEqual(["2025-12", "2026-02"]);
  });
});
