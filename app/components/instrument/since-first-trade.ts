export function sinceFirstTrade<
  T extends { t: number; buy: number | null; sell: number | null },
>(data: readonly T[]): T[] {
  const first = data.find((d) => d.buy !== null || d.sell !== null);
  return first === undefined ? [...data] : data.filter((d) => d.t >= first.t);
}
