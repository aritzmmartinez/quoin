import { es, formatPeriod, formatRelativeTime } from "~/lib";

export interface BasisReferenceProps {
  active: boolean;
  reference: string | null;
  syncedAt: string | null;
}

export function BasisReference({
  active,
  reference,
  syncedAt,
}: BasisReferenceProps) {
  if (!active || !reference) return null;

  const freshness = syncedAt
    ? es.basis.synced(formatRelativeTime(syncedAt))
    : es.basis.neverSynced;

  return (
    <span title={freshness} className="text-[12px] text-muted">
      {es.basis.reference(formatPeriod(reference))}
    </span>
  );
}
