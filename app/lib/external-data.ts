import { dayOf } from "~/core/calendar";

export interface DataUntil {
  kind: "day" | "period";
  value: string;
  name: string | null;
}

export interface SourceStatus {
  lastChecked: string | null;
  until: DataUntil | null;
  idle: boolean;
}

function latestOf(dates: Iterable<Date>): string | null {
  let latest: Date | null = null;
  for (const date of dates) {
    if (latest === null || date.getTime() > latest.getTime()) latest = date;
  }
  return latest?.toISOString() ?? null;
}

export function pricesStatus(input: {
  relevant: readonly { id: string; name: string }[];
  latest: ReadonlyMap<string, { asOf: Date }>;
  checked: ReadonlyMap<string, Date>;
}): SourceStatus {
  let lagging: { name: string; day: string } | null = null;
  let ahead = false;
  for (const { id, name } of input.relevant) {
    const asOf = input.latest.get(id)?.asOf;
    if (!asOf) continue;
    const day = dayOf(asOf);
    if (lagging === null) lagging = { name, day };
    else if (day < lagging.day) {
      ahead = true;
      lagging = { name, day };
    } else if (day > lagging.day) ahead = true;
  }
  return {
    idle: false,
    lastChecked: latestOf(
      input.relevant.flatMap(({ id }) => {
        const at = input.checked.get(id);
        return at ? [at] : [];
      }),
    ),
    until: lagging
      ? { kind: "day", value: lagging.day, name: ahead ? lagging.name : null }
      : null,
  };
}

export function ratesStatus(
  series: readonly {
    currency: string;
    lastDay: string | null;
    lastChecked: Date | null;
  }[],
): SourceStatus {
  if (series.length === 0)
    return { lastChecked: null, until: null, idle: true };
  let lagging: { currency: string; day: string } | null = null;
  let missing = false;
  for (const { currency, lastDay } of series) {
    if (lastDay === null) missing = true;
    else if (lagging === null || lastDay < lagging.day) {
      lagging = { currency, day: lastDay };
    }
  }
  return {
    idle: false,
    lastChecked: latestOf(
      series.flatMap(({ lastChecked }) => (lastChecked ? [lastChecked] : [])),
    ),
    until:
      missing || lagging === null
        ? null
        : {
            kind: "day",
            value: lagging.day,
            name: series.length > 1 ? lagging.currency : null,
          },
  };
}

export function inflationStatus(
  latestPeriod: string | null,
  lastChecked: Date | null,
): SourceStatus {
  return {
    idle: false,
    lastChecked: lastChecked?.toISOString() ?? null,
    until:
      latestPeriod === null
        ? null
        : { kind: "period", value: latestPeriod, name: null },
  };
}
