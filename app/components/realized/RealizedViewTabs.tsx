import { useSearchParams } from "react-router";

import { REALIZED_VIEWS, es, realizedViewHref, type RealizedView } from "~/lib";

import { SegmentedLinks } from "../ui/Segmented";

export function RealizedViewTabs({ value }: { value: RealizedView }) {
  const [params] = useSearchParams();
  const copy = es.realized.views;

  return (
    <SegmentedLinks
      label={copy.label}
      value={value}
      className="mb-4"
      segments={REALIZED_VIEWS.map((view) => ({
        key: view,
        label: copy[view],
        href: realizedViewHref(params, view),
      }))}
    />
  );
}
