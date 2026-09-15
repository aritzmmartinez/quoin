import { useSearchParams } from "react-router";

import {
  ALLOCATION_VIEWS,
  type AllocationView,
  useCopy,
  viewHref,
} from "~/lib";

import { PillLinks } from "../ui/Segmented";

export function ViewTabs({ value }: { value: AllocationView }) {
  const t = useCopy();
  const [params] = useSearchParams();
  const copy = t.allocation.views;

  return (
    <PillLinks
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
