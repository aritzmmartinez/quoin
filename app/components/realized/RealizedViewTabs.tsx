import { useSearchParams } from "react-router";

import {
  REALIZED_VIEWS,
  type RealizedView,
  realizedViewHref,
  useCopy,
} from "~/lib";

import { PillLinks } from "../ui/Segmented";

export function RealizedViewTabs({ value }: { value: RealizedView }) {
  const t = useCopy();
  const [params] = useSearchParams();
  const copy = t.realized.views;

  return (
    <PillLinks
      label={copy.label}
      value={value}
      segments={REALIZED_VIEWS.map((view) => ({
        key: view,
        label: copy[view],
        href: realizedViewHref(params, view),
      }))}
    />
  );
}
