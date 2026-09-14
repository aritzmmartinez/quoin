const DAY_MS = 86_400_000;

export const GRID_CELLS = 42;

function utcOf(iso: string): number | null {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function monthOf(iso: string): string | null {
  return utcOf(iso) === null ? null : iso.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  if (!year || !index) return month;
  const total = year * 12 + (index - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function monthGrid(month: string): string[] {
  const first = utcOf(`${month}-01`);
  if (first === null) return [];
  const weekday = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - weekday * DAY_MS;
  return Array.from({ length: GRID_CELLS }, (_, i) =>
    isoOf(start + i * DAY_MS),
  );
}

export function addDays(iso: string, delta: number): string {
  const ms = utcOf(iso);
  return ms === null ? iso : isoOf(ms + delta * DAY_MS);
}
