import {
  calendarDate,
  parseIsoDate,
  toCalendarDate,
  toIsoDate,
} from "./calendar-date";

const MADRID = "Europe/Madrid";

export function dayOf(instant: Date): string {
  return toIsoDate(toCalendarDate(instant, MADRID));
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
