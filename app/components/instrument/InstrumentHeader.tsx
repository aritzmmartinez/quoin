import type { InstrumentType, Thesis } from "~/core/domain";
import { DASH, useCopy, useFormat } from "~/lib";

import { SignedMoney } from "../SignedMoney";
import { ThesisChip } from "../ui/ThesisChip";

export interface InstrumentHeaderData {
  id: string;
  name: string;
  type: InstrumentType | null;
  thesis: Thesis;
  quantity: string;
  price: { value: string; asOf: string } | null;
  marketValue: string | null;
  unrealizedPnL: string | null;
}

export function InstrumentHeader({
  instrument,
}: {
  instrument: InstrumentHeaderData;
}) {
  const { formatMoney, formatQuantity, formatRelativeTime } = useFormat();
  const t = useCopy();
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[22px] font-semibold tracking-tight">
              {instrument.name}
            </h1>
            <ThesisChip thesis={instrument.thesis} />
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {instrument.id}
            {" · "}
            {instrument.type ? t.labels.instrumentType[instrument.type] : DASH}
            {" · "}
            {t.instrument.units(formatQuantity(instrument.quantity))}
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
              {t.portfolio.updatedAt(formatRelativeTime(instrument.price.asOf))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
