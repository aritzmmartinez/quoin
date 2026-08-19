import { es, formatPeriod } from "~/lib";

export interface BasisNoticeProps {
  basis: "nominal" | "real";
  active: boolean;
  reference: string | null;
  missing: string[];
  hasIndex: boolean;
}

export function BasisNotice({
  basis,
  active,
  reference,
  missing,
  hasIndex,
}: BasisNoticeProps) {
  if (basis === "nominal") return null;

  const body = !hasIndex
    ? es.basis.noIndex
    : !active
      ? `${es.basis.gaps(missing.map(formatPeriod).join(", "))} ${es.basis.showingNominal}`
      : `${es.basis.active(reference === null ? "" : formatPeriod(reference))} ${es.basis.lag}`;

  return (
    <p className="mb-4 max-w-3xl rounded-card border border-border bg-surface-2 px-3 py-2 text-[12px] text-muted">
      {body}
    </p>
  );
}
