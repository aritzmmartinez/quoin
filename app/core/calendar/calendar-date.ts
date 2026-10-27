export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function calendarDate(
  year: number,
  month: number,
  day: number,
): CalendarDate {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new RangeError(`Not a calendar date: ${year}-${month}-${day}`);
  }
  return { year, month, day };
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let formatter = cache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, ...options });
    cache.set(timeZone, formatter);
  }
  return formatter;
}

function partsIn(
  instant: Date | number,
  timeZone: string,
  withTime: boolean,
): Record<string, number> {
  const formatter = withTime
    ? formatterFor(timeFormatters, timeZone, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
    : formatterFor(dateFormatters, timeZone, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts;
}

/*
 * Keyed by UTC minute, not quarter-hour. Every offset in force since 1980 is a
 * multiple of 15 minutes, but not every transition falls on a quarter-hour:
 * St John's switched at 00:01 local until 2011, Casey in 2020–2022. All of them,
 * over every IANA zone, fall on a whole UTC minute, so every instant in one UTC
 * minute shares a calendar day in any zone. Before 1980 not even offsets are
 * round (Kiritimati ran at −10:40 until 1979), so older instants skip the cache.
 */
const BUCKET_MS = 60_000;
const CACHE_FROM_MS = Date.UTC(1980, 0, 1);
const CACHE_LIMIT = 4096;
const dayCache = new Map<string, CalendarDate>();

function readCalendarDate(ms: number, timeZone: string): CalendarDate {
  const { year = 0, month = 0, day = 0 } = partsIn(ms, timeZone, false);
  return calendarDate(year, month, day);
}

/** The calendar day `instant` falls on, read in `timeZone` (an IANA name). */
export function toCalendarDate(instant: Date, timeZone: string): CalendarDate {
  const ms = instant.getTime();
  if (Number.isNaN(ms)) throw new RangeError("Invalid instant");
  if (ms < CACHE_FROM_MS) return readCalendarDate(ms, timeZone);

  const key = `${timeZone}|${Math.floor(ms / BUCKET_MS)}`;
  const cached = dayCache.get(key);
  if (cached) {
    dayCache.delete(key);
    dayCache.set(key, cached);
    return cached;
  }
  const date = readCalendarDate(ms, timeZone);
  dayCache.set(key, date);
  if (dayCache.size > CACHE_LIMIT) {
    const oldest = dayCache.keys().next().value;
    if (oldest !== undefined) dayCache.delete(oldest);
  }
  return date;
}

export function calendarCacheSize(): number {
  return dayCache.size;
}

export const CALENDAR_CACHE_LIMIT = CACHE_LIMIT;

function offsetMs(ms: number, timeZone: string): number {
  const p = partsIn(ms, timeZone, true);
  const wall = Date.UTC(
    p.year ?? 0,
    (p.month ?? 1) - 1,
    p.day ?? 1,
    p.hour ?? 0,
    p.minute ?? 0,
    p.second ?? 0,
  );
  return wall - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * The instant `date` begins in `timeZone`. Throws for a zone whose clocks skip
 * midnight itself (none of the zones Quoin resolves to do).
 */
export function startOfDay(date: CalendarDate, timeZone: string): Date {
  const wall = Date.UTC(date.year, date.month - 1, date.day);
  const first = wall - offsetMs(wall, timeZone);
  const instant = wall - offsetMs(first, timeZone);
  const p = partsIn(instant, timeZone, true);
  if (
    compareCalendarDates(toCalendarDate(new Date(instant), timeZone), date) !==
      0 ||
    p.hour !== 0 ||
    p.minute !== 0 ||
    p.second !== 0
  ) {
    throw new RangeError(`${toIsoDate(date)} has no midnight in ${timeZone}`);
  }
  return new Date(instant);
}

export function addCalendarMonths(date: CalendarDate, n: number): CalendarDate {
  if (!Number.isInteger(n)) {
    throw new RangeError(`Months must be an integer, got ${n}`);
  }
  const index = date.year * 12 + (date.month - 1) + n;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return calendarDate(
    year,
    month,
    Math.min(date.day, daysInMonth(year, month)),
  );
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function isBefore(a: CalendarDate, b: CalendarDate): boolean {
  return compareCalendarDates(a, b) < 0;
}

export function isAfter(a: CalendarDate, b: CalendarDate): boolean {
  return compareCalendarDates(a, b) > 0;
}

export function isWithin(
  date: CalendarDate,
  start: CalendarDate,
  end: CalendarDate,
): boolean {
  return !isBefore(date, start) && !isAfter(date, end);
}

/** `YYYY-MM-DD`. */
export function toIsoDate(date: CalendarDate): string {
  const y = String(date.year).padStart(4, "0");
  const m = String(date.month).padStart(2, "0");
  const d = String(date.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inverse of `toIsoDate`; refuses anything that is not a real `YYYY-MM-DD`. */
export function parseIsoDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${value}`);
  return calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}
