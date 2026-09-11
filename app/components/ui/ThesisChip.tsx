import type { Thesis } from "~/core/domain";
import { thesisDescription, thesisLabel } from "~/lib";

export function ThesisChip({ thesis }: { thesis: Thesis }) {
  if (thesis === "CORE") return null;

  return (
    <span
      title={thesisDescription(thesis)}
      className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted"
    >
      {thesisLabel(thesis)}
    </span>
  );
}
