import { TrendingDown, TrendingUp } from "lucide-react";

import { type Range, useCopy, useFormat } from "~/lib";

import { signClass, signedPercent } from "../ui/signed";

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
  const { formatMoney, formatSignedMoney, formatPercent } = useFormat();
  const t = useCopy();
  const rangeLabels: Record<Range, string> = {
    "1m": t.range.m1,
    "6m": t.range.m6,
    "1y": t.range.y1,
    all: t.range.all,
  };
  const h = t.summary.hero;
  const rangeLabel =
    range === "all" ? h.allTimeLabel : h.rangeLabel(rangeLabels[range]);
  const negative = changeAbs !== null && Number(changeAbs) < 0;
  const Arrow = negative ? TrendingDown : TrendingUp;

  return (
    <header className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">{h.label}</p>
      <p
        className="font-mono font-bold tabular-nums"
        style={{ fontSize: "clamp(36px, 5vw, 52px)", letterSpacing: "-0.04em" }}
      >
        {hasPositions ? formatMoney(totalValue) : h.empty}
      </p>
      {changeAbs !== null && (
        <p className="flex items-center gap-2 font-mono text-[13px]">
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
            {signedPercent(formatPercent, changePct)}
          </span>
          <span className="font-sans text-muted">{rangeLabel}</span>
        </p>
      )}
      {unpricedCount > 0 && (
        <p className="text-[12px] text-muted">{h.unpriced(unpricedCount)}</p>
      )}
    </header>
  );
}
