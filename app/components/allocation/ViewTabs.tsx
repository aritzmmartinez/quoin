import { useSearchParams } from "react-router";

import { ALLOCATION_VIEWS, es, viewHref, type AllocationView } from "~/lib";

import { SegmentedLinks } from "../ui/Segmented";

export function ViewTabs({ value }: { value: AllocationView }) {
  const [params] = useSearchParams();
  const copy = es.allocation.views;

  return (
    <SegmentedLinks
      label={copy.label}
      value={value}
      className="mb-4"
      segments={ALLOCATION_VIEWS.map((view) => ({
        key: view,
        label: copy[view],
        href: viewHref(params, view),
      }))}
    />
  );
}
