import { useCopy } from "~/lib";
import type { UnratedNames } from "~/lib/unrated";

import { Explainer } from "./Explainer";

export function UnratedNotice({
  unrated,
  className,
}: {
  unrated: UnratedNames | null;
  className?: string;
}) {
  const t = useCopy();
  if (!unrated) return null;
  return (
    <Explainer tone="notice" {...(className ? { className } : {})}>
      {t.fx.unrated(unrated.names, unrated.currencies)}
    </Explainer>
  );
}
