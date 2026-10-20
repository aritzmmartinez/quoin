import { shiftDay } from "../calendar";

export function lastOnOrBefore<T, K extends number | string>(
  sorted: readonly T[],
  keyOf: (item: T) => K,
  key: K,
  earliest: K | null,
): T | null {
  let lo = 0;
  let hi = sorted.length - 1;
  let found: T | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = sorted[mid]!;
    if (keyOf(candidate) <= key) {
      found = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found === null) return null;
  if (earliest !== null && keyOf(found) < earliest) return null;
  return found;
}

export function atOrBefore<T>(
  sorted: readonly T[],
  timeOf: (item: T) => number,
  at: number,
  maxAgeMs: number | null,
): T | null {
  return lastOnOrBefore(
    sorted,
    timeOf,
    at,
    maxAgeMs === null ? null : at - maxAgeMs,
  );
}

export function onOrBeforeDay<T>(
  sorted: readonly T[],
  dayOf: (item: T) => string,
  day: string,
  maxAgeDays: number | null,
): T | null {
  return lastOnOrBefore(
    sorted,
    dayOf,
    day,
    maxAgeDays === null ? null : shiftDay(day, -maxAgeDays),
  );
}
