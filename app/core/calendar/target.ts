import { calendarDate, parseIsoDate, toIsoDate } from "./calendar-date";
import { shiftDay } from "./day";

export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIsoDate(calendarDate(year, month, day));
}

function closingDays(year: number): ReadonlySet<string> {
  const easter = easterSunday(year);
  return new Set([
    `${year}-01-01`,
    shiftDay(easter, -2),
    shiftDay(easter, 1),
    `${year}-05-01`,
    `${year}-12-25`,
    `${year}-12-26`,
  ]);
}

export function isTargetBusinessDay(day: string): boolean {
  const { year, month, day: d } = parseIsoDate(day);
  const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !closingDays(year).has(day);
}

export function rateDayFor(day: string): string {
  let candidate = day;
  while (!isTargetBusinessDay(candidate)) candidate = shiftDay(candidate, -1);
  return candidate;
}
