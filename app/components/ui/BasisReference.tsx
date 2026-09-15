import { useCopy, useFormat } from "~/lib";

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
  const { formatPeriod, formatRelativeTime } = useFormat();
  const t = useCopy();
  if (!active || !reference) return null;

  return (
    <span className="flex items-center gap-1 text-[12px] text-muted">
      {t.basis.reference(formatPeriod(reference))}
      <InfoHint
        name={t.basis.about}
        size={18}
        label={
          <>
            <span>{t.basis.perFlow}</span>
            <span className="text-muted">{t.basis.lag}</span>
            <span className="text-muted">
              {syncedAt
                ? t.basis.synced(formatRelativeTime(syncedAt))
                : t.basis.neverSynced}
            </span>
          </>
        }
      />
    </span>
  );
}
