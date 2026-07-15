import { TrendingDown, TrendingUp } from "lucide-react";

import { es, formatMoney, formatSignedMoney, type Range } from "~/lib";

import { signClass, signedPercent } from "../ui/signed";

const RANGE_LABEL: Record<Range, string> = {
  "1m": es.range.m1,
  "6m": es.range.m6,
  "1y": es.range.y1,
  all: es.range.all,
};

export interface SummaryHeroProps {
  totalValue: string;
  changeAbs: string | null;
  changePct: string | null;
  range: Range;
  unpricedCount: number;
  hasPositions: boolean;
}

export function SummaryHero({
  totalValue,
  changeAbs,
  changePct,
  range,
  unpricedCount,
  hasPositions,
}: SummaryHeroProps) {
  const h = es.summary.hero;
  const rangeLabel =
    range === "all" ? h.allTimeLabel : h.rangeLabel(RANGE_LABEL[range]);
  const negative = changeAbs !== null && Number(changeAbs) < 0;
  const Arrow = negative ? TrendingDown : TrendingUp;

  return (
    <header className="mb-6">
      <p className="text-[12px] text-muted">{h.label}</p>
      <p
        className="mt-1 font-semibold tabular-nums"
        style={{ fontSize: "clamp(36px, 5vw, 52px)", letterSpacing: "-0.03em" }}
      >
        {hasPositions ? formatMoney(totalValue) : h.empty}
      </p>
      {changeAbs !== null && (
        <p className="mt-1.5 flex items-center gap-2 text-[13px]">
          <Arrow
            className={signClass(changeAbs)}
            size={16}
            strokeWidth={2}
            aria-hidden
          />
          <span className={`font-medium tabular-nums ${signClass(changeAbs)}`}>
            {formatSignedMoney(changeAbs).text}
          </span>
          <span className={`font-medium tabular-nums ${signClass(changePct)}`}>
            {signedPercent(changePct)}
          </span>
          <span className="text-muted">{rangeLabel}</span>
        </p>
      )}
      {unpricedCount > 0 && (
        <p className="mt-1.5 text-[12px] text-muted">
          {h.unpriced(unpricedCount)}
        </p>
      )}
    </header>
  );
}
