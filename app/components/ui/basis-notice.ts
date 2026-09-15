import type { Copy, Format } from "~/lib";

export interface BasisNoticeProps {
  basis: "nominal" | "real";
  active: boolean;
  missing: string[];
  hasIndex: boolean;
  checkStale: boolean;
}

export function basisNotice(
  t: Copy,
  formatPeriod: Format["formatPeriod"],
  { basis, active, missing, hasIndex, checkStale }: BasisNoticeProps,
): string | null {
  if (basis === "nominal") return null;

  if (!hasIndex) return t.basis.noIndex;

  if (!active) {
    const periods = missing.map(formatPeriod).join(", ");
    return `${t.basis.gaps(periods)} ${t.basis.showingNominal}`;
  }

  return checkStale ? t.basis.maybeBehind : null;
}
