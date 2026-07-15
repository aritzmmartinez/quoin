import { DASH, formatPercent } from "~/lib";

export function signClass(fraction: string | null): string {
  if (fraction === null) return "";
  const n = Number(fraction);
  return n > 0 ? "text-positive" : n < 0 ? "text-negative" : "";
}

export function signedPercent(fraction: string | null): string {
  if (fraction === null) return DASH;
  const n = Number(fraction);
  const body = formatPercent(String(Math.abs(n)));
  return n < 0 ? `\u2212${body}` : n > 0 ? `+${body}` : body;
}
