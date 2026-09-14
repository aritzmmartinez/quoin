const DAY = 86_400_000;
const DAY_STEPS = [1, 2, 7, 14, 28] as const;
const MONTH_STEPS = [1, 2, 3, 6, 12] as const;
const DAY_SPAN_LIMIT = 75 * DAY;

export type TimeTickUnit = "day" | "month";

export interface TimeTicks {
  unit: TimeTickUnit;
  ticks: number[];
}

export function timeTicks(from: number, to: number, max = 6): TimeTicks {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || max < 2) {
    return { unit: "month", ticks: [] };
  }

  return to - from < DAY_SPAN_LIMIT
    ? { unit: "day", ticks: byDay(from, to, max) }
    : { unit: "month", ticks: byMonth(from, to, max) };
}

function byDay(from: number, to: number, max: number): number[] {
  const days = (to - from) / DAY;
  const step = DAY_STEPS.find((s) => days / s <= max - 1) ?? 28;

  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  if (cursor.getTime() < from) cursor.setDate(cursor.getDate() + 1);

  const ticks: number[] = [];
  while (cursor.getTime() <= to) {
    ticks.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + step);
  }
  return ticks;
}

function byMonth(from: number, to: number, max: number): number[] {
  const start = new Date(from);
  const end = new Date(to);
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    end.getMonth() -
    start.getMonth();

  const step =
    MONTH_STEPS.find((s) => months / s <= max - 1) ??
    12 * Math.ceil(months / 12 / (max - 1));

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  if (cursor.getTime() < from) cursor.setMonth(cursor.getMonth() + 1);

  const offset = (cursor.getFullYear() * 12 + cursor.getMonth()) % step;
  if (offset !== 0) cursor.setMonth(cursor.getMonth() + (step - offset));

  const ticks: number[] = [];
  while (cursor.getTime() <= to) {
    ticks.push(cursor.getTime());
    cursor.setMonth(cursor.getMonth() + step);
  }
  return ticks;
}
