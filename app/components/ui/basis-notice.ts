import { es, formatPeriod } from "~/lib";

export interface BasisNoticeProps {
  basis: "nominal" | "real";
  active: boolean;
  missing: string[];
  hasIndex: boolean;
  checkStale: boolean;
}

export interface Notice {
  body: string;
  offerSync: boolean;
}

export function basisNotice({
  basis,
  active,
  missing,
  hasIndex,
  checkStale,
}: BasisNoticeProps): Notice | null {
  if (basis === "nominal") return null;

  if (!hasIndex) return { body: es.basis.noIndex, offerSync: true };

  if (!active) {
    const periods = missing.map(formatPeriod).join(", ");
    return {
      body: `${es.basis.gaps(periods)} ${es.basis.showingNominal}`,
      offerSync: true,
    };
  }

  if (checkStale) {
    return {
      body: `${es.basis.perFlow} ${es.basis.maybeBehind}`,
      offerSync: true,
    };
  }

  return { body: `${es.basis.perFlow} ${es.basis.lag}`, offerSync: false };
}
