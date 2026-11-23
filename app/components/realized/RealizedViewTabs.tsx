import { useSearchParams } from "react-router";

import type { Residence } from "~/core/domain";
import {
  REALIZED_VIEWS,
  type RealizedView,
  realizedViewHref,
  useCopy,
} from "~/lib";

import { PillLinks } from "../ui/Segmented";

export function RealizedViewTabs({
  value,
  residence,
}: {
  value: RealizedView;
  residence: Residence;
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
            ? copy.tax(t.realized.fiscal.residenceName[residence])
            : copy[view],
        href: realizedViewHref(params, view),
      }))}
    />
  );
}
