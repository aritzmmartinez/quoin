import { Link, useSearchParams } from "react-router";

import type { FundOverlapPair } from "~/core/projections";
import { OVERLAP_MODES, es, modeHref, type OverlapMode } from "~/lib";

import { Card } from "../ui/Card";
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
}: {
  funds: readonly OverlapFund[];
  pairs: readonly FundOverlapPair[];
  mode: OverlapMode;
}) {
  const copy = es.overlap;

  if (funds.length < 2) {
    return (
      <Card className="p-6">
        <h2 className="mb-1 text-[14px] font-semibold">{copy.title}</h2>
        <p className="py-8 text-center text-[13px] leading-normal text-muted">
          {copy.empty}
        </p>
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
        <ModeTabs value={mode} />
      </Card>

      {mode === "matriz" ? (
        <OverlapMatrix funds={funds} pairs={pairs} />
      ) : (
        <OverlapList funds={funds} pairs={pairs} />
      )}

      <p className="text-[11.5px] leading-normal text-muted">{copy.note}</p>
    </div>
  );
}

function ModeTabs({ value }: { value: OverlapMode }) {
  const [params] = useSearchParams();
  const copy = es.overlap.modes;

  return (
    <nav
      aria-label={copy.label}
      className="inline-flex rounded-lg border border-border p-0.5"
    >
      {OVERLAP_MODES.map((mode) => (
        <Link
          key={mode}
          to={modeHref(params, mode)}
          aria-current={value === mode ? "page" : undefined}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
            value === mode
              ? "bg-surface-2 text-text"
              : "text-muted hover:text-text"
          }`}
        >
          {copy[mode]}
        </Link>
      ))}
    </nav>
  );
}
