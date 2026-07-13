import { Link } from "react-router";

import type { InstrumentType, Sleeve } from "~/core/domain";
import {
  DASH,
  es,
  formatMoney,
  formatQuantity,
  formatRelativeTime,
  instrumentTypeLabel,
} from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { SleeveChip } from "../ui/SleeveChip";

export interface InstrumentHeaderData {
  id: string;
  name: string;
  type: InstrumentType | null;
  sleeves: Sleeve[];
  quantity: string;
  price: { value: string; asOf: string } | null;
  marketValue: string | null;
  unrealizedPnL: string | null;
}

function BackArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function InstrumentHeader({
  instrument,
}: {
  instrument: InstrumentHeaderData;
}) {
  return (
    <header className="mb-6">
      <Link
        to="/"
        className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted transition-colors hover:text-text"
      >
        <BackArrow />
        {es.instrument.back}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[22px] font-semibold tracking-tight">
              {instrument.name}
            </h1>
            {instrument.sleeves.map((s) => (
              <SleeveChip key={s} sleeve={s} />
            ))}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {instrument.id}
            {" · "}
            {instrument.type ? instrumentTypeLabel(instrument.type) : DASH}
            {" · "}
            {es.instrument.units(formatQuantity(instrument.quantity))}
          </div>
        </div>

        <div className="text-right">
          {instrument.price && (
            <div className="text-[20px] font-semibold tabular-nums">
              {formatMoney(instrument.price.value)}
            </div>
          )}
          <div className="mt-0.5 flex items-center justify-end gap-2 text-[13px]">
            {instrument.marketValue !== null && (
              <span className="text-muted">
                {formatMoney(instrument.marketValue)}
              </span>
            )}
            {instrument.unrealizedPnL !== null && (
              <SignedMoney
                value={instrument.unrealizedPnL}
                className="font-medium"
              />
            )}
          </div>
          {instrument.price && (
            <div className="mt-0.5 text-[11.5px] text-muted">
              {es.portfolio.updatedAt(
                formatRelativeTime(instrument.price.asOf),
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
