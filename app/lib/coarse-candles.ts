export const COARSE_GAP_DAYS = 6;
export const COARSE_RUN = 3;
const MIN_GAPS = 3;

export function isCoarseSeries(times: readonly Date[]): boolean {
  const sorted = times.map((t) => t.getTime()).sort((a, b) => a - b);
  const coarse = sorted
    .slice(1)
    .map((t, i) => (t - sorted[i]!) / 86_400_000 >= COARSE_GAP_DAYS);
  if (coarse.length < MIN_GAPS) return false;

  if (coarse.filter(Boolean).length * 2 > coarse.length) return true;

  let run = 0;
  for (const gap of coarse) {
    run = gap ? run + 1 : 0;
    if (run >= COARSE_RUN) return true;
  }
  return false;
}
