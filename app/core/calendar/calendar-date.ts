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

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The calendar day `instant` falls on, read in `timeZone` (an IANA name). */
export function toCalendarDate(instant: Date, timeZone: string): CalendarDate {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Invalid instant");
  }
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type === "year") year = Number(part.value);
    else if (part.type === "month") month = Number(part.value);
    else if (part.type === "day") day = Number(part.value);
  }
  return calendarDate(year, month, day);
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
