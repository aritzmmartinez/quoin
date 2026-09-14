import { es, formatPeriod } from "~/lib";

export interface BasisNoticeProps {
  basis: "nominal" | "real";
  active: boolean;
  missing: string[];
  hasIndex: boolean;
  checkStale: boolean;
}

export function basisNotice({
  basis,
  active,
  missing,
  hasIndex,
  checkStale,
}: BasisNoticeProps): string | null {
  if (basis === "nominal") return null;

  if (!hasIndex) return es.basis.noIndex;

  if (!active) {
    const periods = missing.map(formatPeriod).join(", ");
    return `${es.basis.gaps(periods)} ${es.basis.showingNominal}`;
  }

  return checkStale ? es.basis.maybeBehind : null;
}
