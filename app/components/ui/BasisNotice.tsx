import { es, formatPeriod } from "~/lib";

import { Explainer } from "./Explainer";

export interface BasisNoticeProps {
  basis: "nominal" | "real";
  active: boolean;
  missing: string[];
  hasIndex: boolean;
}

export function BasisNotice({
  basis,
  active,
  missing,
  hasIndex,
}: BasisNoticeProps) {
  if (basis === "nominal") return null;

  const body = !hasIndex
    ? es.basis.noIndex
    : !active
      ? `${es.basis.gaps(missing.map(formatPeriod).join(", "))} ${es.basis.showingNominal}`
      : `${es.basis.perFlow} ${es.basis.lag}`;

  return (
    <Explainer tone="notice" className="mb-4">
      {body}
    </Explainer>
  );
}
