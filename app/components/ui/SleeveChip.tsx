import type { Sleeve } from "~/core/domain";
import { sleeveLabel } from "~/lib";

export function SleeveChip({ sleeve }: { sleeve: Sleeve }) {
  return (
    <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
      {sleeveLabel(sleeve)}
    </span>
  );
}
