export type Range = "1m" | "6m" | "1y" | "all";

export const RANGE_DAYS: Record<Range, number | null> = {
  "1m": 30,
  "6m": 182,
  "1y": 365,
  all: null,
};

export const RANGE_KEYS = ["1m", "6m", "1y", "all"] as const;

export const DEFAULT_RANGE: Range = "all";

function isRange(value: string | null): value is Range {
  return value !== null && (RANGE_KEYS as readonly string[]).includes(value);
}

export function parseRange(params: URLSearchParams): Range {
  const raw = params.get("range");
  return isRange(raw) ? raw : DEFAULT_RANGE;
}

export function filterByRange<T extends { t: number }>(
  data: readonly T[],
  range: Range,
  now: Date = new Date(),
): T[] {
  const days = RANGE_DAYS[range];
  if (days === null) return [...data];
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return data.filter((d) => d.t >= cutoff);
}
