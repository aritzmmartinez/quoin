import { basisNotice, type BasisNoticeProps } from "./basis-notice";
import { IpcSyncButton } from "./IpcSyncButton";

export type { BasisNoticeProps };

export function BasisNotice(props: BasisNoticeProps) {
  const body = basisNotice(props);
  if (body === null) return null;

  return (
    <div className="flex max-w-[70ch] items-start justify-between gap-3 rounded-card border border-border bg-surface-2 px-3 py-2">
      <p className="text-[12px] text-muted">{body}</p>
      <IpcSyncButton />
    </div>
  );
}
