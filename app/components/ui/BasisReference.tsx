import { es, formatPeriod, formatRelativeTime } from "~/lib";

import { InfoHint } from "./Hint";

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

  return (
    <span className="flex items-center gap-1 text-[12px] text-muted">
      {es.basis.reference(formatPeriod(reference))}
      <InfoHint
        name={es.basis.about}
        size={18}
        label={
          <>
            <span>{es.basis.perFlow}</span>
            <span className="text-muted">{es.basis.lag}</span>
            <span className="text-muted">
              {syncedAt
                ? es.basis.synced(formatRelativeTime(syncedAt))
                : es.basis.neverSynced}
            </span>
          </>
        }
      />
    </span>
  );
}
