import {
  addCalendarMonths,
  calendarDate,
  parseIsoDate,
  shiftDay,
  startOfDay,
  toCalendarDate,
  toIsoDate,
  type CalendarDate,
} from "~/core/calendar";

const DAY = 86_400_000;
const DAY_STEPS = [1, 2, 7, 14, 28] as const;
const MONTH_STEPS = [1, 2, 3, 6, 12] as const;
const DAY_SPAN_LIMIT = 75 * DAY;

export type TimeTickUnit = "day" | "month";

export interface TimeTicks {
  unit: TimeTickUnit;
  ticks: number[];
}

export function timeTicks(
  from: number,
  to: number,
  zone: string,
  max = 6,
): TimeTicks {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || max < 2) {
    return { unit: "month", ticks: [] };
  }

  return to - from < DAY_SPAN_LIMIT
    ? { unit: "day", ticks: byDay(from, to, zone, max) }
    : { unit: "month", ticks: byMonth(from, to, zone, max) };
}

export function startsYear(t: number, zone: string): boolean {
  return toCalendarDate(new Date(t), zone).month === 1;
}

function instantOf(date: CalendarDate, zone: string): number {
  return startOfDay(date, zone).getTime();
}

function byDay(from: number, to: number, zone: string, max: number): number[] {
  const days = (to - from) / DAY;
  const step = DAY_STEPS.find((s) => days / s <= max - 1) ?? 28;

  let day = toIsoDate(toCalendarDate(new Date(from), zone));
  if (instantOf(parseIsoDate(day), zone) < from) day = shiftDay(day, 1);

  const ticks: number[] = [];
  for (
    let t = instantOf(parseIsoDate(day), zone);
    t <= to;
    t = instantOf(parseIsoDate(day), zone)
  ) {
    ticks.push(t);
    day = shiftDay(day, step);
  }
  return ticks;
}

function byMonth(
  from: number,
  to: number,
  zone: string,
  max: number,
): number[] {
  const start = toCalendarDate(new Date(from), zone);
  const end = toCalendarDate(new Date(to), zone);
  const months = (end.year - start.year) * 12 + end.month - start.month;

  const step =
    MONTH_STEPS.find((s) => months / s <= max - 1) ??
    12 * Math.ceil(months / 12 / (max - 1));

  let cursor = calendarDate(start.year, start.month, 1);
  if (instantOf(cursor, zone) < from) cursor = addCalendarMonths(cursor, 1);

  const offset = (cursor.year * 12 + cursor.month - 1) % step;
  if (offset !== 0) cursor = addCalendarMonths(cursor, step - offset);

  const ticks: number[] = [];
  for (let t = instantOf(cursor, zone); t <= to; t = instantOf(cursor, zone)) {
    ticks.push(t);
    cursor = addCalendarMonths(cursor, step);
  }
  return ticks;
}
