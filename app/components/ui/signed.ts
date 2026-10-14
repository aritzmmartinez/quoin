import type { PeriodReturns } from "~/core/projections";
import { type Copy, DASH, type Format } from "~/lib";

export function signClass(fraction: string | null): string {
  if (fraction === null) return "";
  const n = Number(fraction);
  return n > 0 ? "text-positive" : n < 0 ? "text-negative" : "";
}

export function signedPercent(
  formatPercent: Format["formatPercent"],
  fraction: string | null,
): string {
  if (fraction === null) return DASH;
  const n = Number(fraction);
  const body = formatPercent(String(Math.abs(n)));
  return n < 0 ? `\u2212${body}` : n > 0 ? `+${body}` : body;
}

export function periodReturnTile(
  period: PeriodReturns,
  kind: "twr" | "mwr",
  format: Pick<Format, "formatPercent" | "formatDate">,
  t: Copy,
): { value: string; sub: string; sign: string | null } {
  const figure = period[kind];
  const shown = period.annualized ? figure.annual : figure.cumulative;
  if (shown === null || period.since === null) {
    return { value: DASH, sub: t.periodReturn.unavailable, sign: null };
  }
  const since = format.formatDate(new Date(period.since).toISOString());
  const cumulative = signedPercent(format.formatPercent, figure.cumulative);
  const annual =
    kind === "twr"
      ? t.periodReturn.annual(cumulative, since)
      : t.periodReturn.annualEquivalent(cumulative, since);
  return {
    value: signedPercent(format.formatPercent, shown),
    sub: period.annualized ? annual : t.periodReturn.period(since),
    sign: shown,
  };
}
