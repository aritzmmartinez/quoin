import { useSearchParams } from "react-router";

import type { Territory } from "~/core/tax";
import {
  REALIZED_VIEWS,
  type RealizedView,
  realizedViewHref,
  useCopy,
} from "~/lib";

import { PillLinks } from "../ui/Segmented";

export function RealizedViewTabs({
  value,
  territory,
}: {
  value: RealizedView;
  territory: Territory;
}) {
  const t = useCopy();
  const [params] = useSearchParams();
  const copy = t.realized.views;

  return (
    <PillLinks
      label={copy.label}
      value={value}
      segments={REALIZED_VIEWS.map((view) => ({
        key: view,
        label:
          view === "tax"
            ? copy.tax(t.realized.fiscal.territoryName[territory])
            : copy[view],
        href: realizedViewHref(params, view),
      }))}
    />
  );
}
