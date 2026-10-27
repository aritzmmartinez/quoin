import {
  calendarDate,
  parseIsoDate,
  toCalendarDate,
  toIsoDate,
} from "./calendar-date";

export function dayOf(instant: Date, zone: string): string {
  return toIsoDate(toCalendarDate(instant, zone));
}

export function today(zone: string, now: Date): string {
  return dayOf(now, zone);
}

/** `YYYY-MM`, the month an instant belongs to in `zone`. */
export function periodOf(instant: Date, zone: string): string {
  return dayOf(instant, zone).slice(0, 7);
}

export function fiscalYearOf(instant: Date, zone: string): number {
  return toCalendarDate(instant, zone).year;
}

export function shiftDay(day: string, n: number): string {
  const { year, month, day: d } = parseIsoDate(day);
  const shifted = new Date(Date.UTC(year, month - 1, d + n));
  return toIsoDate(
    calendarDate(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate(),
    ),
  );
}
