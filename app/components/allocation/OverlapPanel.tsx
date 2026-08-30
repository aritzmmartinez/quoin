import { Link, useSearchParams } from "react-router";

import type { FundOverlapPair } from "~/core/projections";
import {
  OVERLAP_MODES,
  es,
  includeSoldHref,
  modeHref,
  type OverlapMode,
} from "~/lib";

import { Card } from "../ui/Card";
import { Explainer } from "../ui/Explainer";
import { SegmentedLinks } from "../ui/Segmented";
import { OverlapList } from "./OverlapList";
import { OverlapMatrix } from "./OverlapMatrix";

export interface OverlapFund {
  id: string;
  name: string;
}

export function OverlapPanel({
  funds,
  pairs,
  mode,
  includeSold,
}: {
  funds: readonly OverlapFund[];
  pairs: readonly FundOverlapPair[];
  mode: OverlapMode;
  includeSold: boolean;
}) {
  const copy = es.overlap;

  if (funds.length < 2) {
    return (
      <Card className="p-6">
        <h2 className="mb-1 text-[14px] font-semibold">{copy.title}</h2>
        <p className="py-8 text-center text-[13px] leading-normal text-muted">
          {copy.empty}
        </p>
        <div className="mt-2 flex justify-center">
          <IncludeSoldToggle value={includeSold} />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="min-w-0 p-6">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold">{copy.title}</h2>
          <span className="text-[11.5px] text-muted">
            {copy.header(funds.length, pairs.length)}
          </span>
        </div>
        <p className="mb-3 text-[12.5px] leading-normal text-muted">
          {copy.intro}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ModeTabs value={mode} />
          <IncludeSoldToggle value={includeSold} />
        </div>
      </Card>

      {mode === "matriz" ? (
        <OverlapMatrix funds={funds} pairs={pairs} />
      ) : (
        <OverlapList funds={funds} pairs={pairs} />
      )}

      <Explainer tone="footnote">{copy.note}</Explainer>
    </div>
  );
}

function IncludeSoldToggle({ value }: { value: boolean }) {
  const [params] = useSearchParams();
  const copy = es.overlap;

  return (
    <Link
      to={includeSoldHref(params, !value)}
      aria-current={value ? "page" : undefined}
      title={copy.includeSoldHint}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
        value
          ? "border-border bg-surface-2 text-text"
          : "border-border text-muted hover:text-text"
      }`}
    >
      {copy.includeSold}
    </Link>
  );
}

function ModeTabs({ value }: { value: OverlapMode }) {
  const [params] = useSearchParams();
  const copy = es.overlap.modes;

  return (
    <SegmentedLinks
      label={copy.label}
      value={value}
      segments={OVERLAP_MODES.map((mode) => ({
        key: mode,
        label: copy[mode],
        href: modeHref(params, mode),
      }))}
    />
  );
}
