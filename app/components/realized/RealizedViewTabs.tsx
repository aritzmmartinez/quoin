import { useSearchParams } from "react-router";

import { REALIZED_VIEWS, es, realizedViewHref, type RealizedView } from "~/lib";

import { PillLinks } from "../ui/Segmented";

export function RealizedViewTabs({ value }: { value: RealizedView }) {
  const [params] = useSearchParams();
  const copy = es.realized.views;

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
