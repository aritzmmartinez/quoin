import { Info } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import type { FundOverlapPair } from "~/core/projections";
import {
  includeSoldHref,
  modeHref,
  OVERLAP_MODES,
  type OverlapMode,
  useCopy,
} from "~/lib";

import { Card } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { Explainer } from "../ui/Explainer";
import { Hint } from "../ui/Hint";
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
  const t = useCopy();
  const copy = t.overlap;

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

      {mode === "matrix" ? (
        <OverlapMatrix funds={funds} pairs={pairs} />
      ) : (
        <OverlapList funds={funds} pairs={pairs} />
      )}

      <Explainer tone="footnote">{copy.note}</Explainer>
    </div>
  );
}

function IncludeSoldToggle({ value }: { value: boolean }) {
  const t = useCopy();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const copy = t.overlap;

  return (
    <div className="flex items-center gap-1.5">
      <Checkbox
        name="includeSold"
        checked={value}
        onChange={(checked) =>
          void navigate(includeSoldHref(params, checked), {
            preventScrollReset: true,
          })
        }
      >
        {copy.includeSold}
      </Checkbox>
      <Hint
        label={copy.includeSoldHint}
        name={copy.includeSold}
        className="shrink-0 text-muted"
      >
        <Info size={12} strokeWidth={1.75} aria-hidden />
      </Hint>
    </div>
  );
}

function ModeTabs({ value }: { value: OverlapMode }) {
  const t = useCopy();
  const [params] = useSearchParams();
  const copy = t.overlap.modes;

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
