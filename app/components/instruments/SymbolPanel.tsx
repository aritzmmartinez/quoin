import { useState } from "react";
import { useRevalidator } from "react-router";

import type { HistoryRange } from "~/core/ports";

import {
  type InstrumentListItem,
  lostHistoryBefore,
  rangeSince,
  useCopy,
  useFormat,
} from "~/lib";
import { postIngest } from "../ingest/api";
import { HistoryRangeSelect } from "../ingest/HistoryRangeSelect";
import { SymbolMapper } from "../ingest/SymbolMapper";
import { Button } from "../ui/Button";

type Result =
  | { ok: true; text: string; note: string | null }
  | { ok: false; text: string };

export function SymbolPanel({ item }: { item: InstrumentListItem }) {
  const t = useCopy();
  const copy = t.instruments.history;
  const { formatDate } = useFormat();
  const revalidator = useRevalidator();

  const earliest = item.historyStart ? new Date(item.historyStart) : null;
  const [range, setRange] = useState<HistoryRange>(() =>
    rangeSince(earliest, new Date()),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const lost = lostHistoryBefore(range, earliest, new Date());
  const hasHistory = item.historyStart !== null;

  async function replace(symbol: string): Promise<string | null> {
    setBusy(true);
    setResult(null);
    const response = await postIngest(t, {
      intent: "replace",
      instrumentId: item.id,
      symbol,
      range,
    });
    setBusy(false);
    setPending(null);
    if (!response.ok) {
      setResult({ ok: false, text: response.error });
      return response.error;
    }
    if (response.step === "replace") {
      setResult({
        ok: true,
        text: copy.done(response.written, formatDate(response.first)),
        note: response.live ? null : copy.noLive,
      });
      void revalidator.revalidate();
    }
    return null;
  }

  async function onSave(symbol: string): Promise<string | null> {
    if (!item.quoteSymbol && !hasHistory) return replace(symbol);
    setResult(null);
    setPending(symbol);
    return null;
  }

  return (
    <div className="border-t border-border-subtle bg-surface-2 px-gutter py-4 text-[12px]">
      <p className="mb-1 text-[13px] font-semibold">{copy.title}</p>
      <p className="mb-3 max-w-3xl text-muted">{t.ingest.map.warning}</p>

      <div className="flex flex-wrap items-end gap-4">
        <SymbolMapper
          instrumentId={item.id}
          stored={item.quoteSymbol}
          saveLabel={item.quoteSymbol ? copy.change : copy.assign}
          disabled={busy || pending !== null}
          onSave={onSave}
          onVerify={() => setResult(null)}
          redownload={{
            label: copy.redownload,
            run: (symbol) => {
              setResult(null);
              setPending(symbol);
            },
          }}
        />
        <HistoryRangeSelect
          value={range}
          onChange={setRange}
          disabled={busy || pending !== null}
        />
      </div>

      {pending && (
        <div className="mt-3 max-w-3xl rounded-md border border-border bg-surface px-3 py-2">
          <p>{copy.confirmReplace(pending)}</p>
          {lost && earliest && (
            <p className="mt-1 text-negative">
              {copy.lost(
                formatDate(lost.toISOString()),
                formatDate(earliest.toISOString()),
              )}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => void replace(pending)}
              disabled={busy}
            >
              {busy ? copy.running : copy.confirm}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={busy}
            >
              {copy.cancel}
            </Button>
          </div>
        </div>
      )}

      {busy && !pending && <p className="mt-3 text-muted">{copy.running}</p>}
      {result && (
        <p className={`mt-3 ${result.ok ? "text-muted" : "text-negative"}`}>
          {result.text}
          {result.ok && result.note ? ` ${result.note}` : ""}
        </p>
      )}
    </div>
  );
}
