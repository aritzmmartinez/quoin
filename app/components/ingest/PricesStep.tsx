import { useState } from "react";

import type { HistoryRange } from "~/core/ports";
import type { PriceFillResult } from "~/lib/ingest";

import { DEFAULT_HISTORY_RANGE, HISTORY_RANGES, es } from "~/lib";
import { Button } from "../ui/Button";
import { postIngest } from "./api";

export function PricesStep({
  instrumentIds,
  onDone,
}: {
  instrumentIds: readonly string[];
  onDone: (result: PriceFillResult | null) => void;
}) {
  const copy = es.ingest.prices;
  const [range, setRange] = useState<HistoryRange>(DEFAULT_HISTORY_RANGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (instrumentIds.length === 0) {
    return <p className="text-[12px] text-muted">{copy.nothing}</p>;
  }

  async function run() {
    setBusy(true);
    setError(null);
    const response = await postIngest({
      intent: "fill",
      instrumentIds: instrumentIds.join(","),
      range,
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    if (response.step === "fill") onDone(response);
  }

  return (
    <>
      <p className="mb-2 text-[12px] text-muted">{copy.intro}</p>
      <p className="mb-4 text-[12px] text-muted">{copy.rangeHint}</p>

      <label className="mb-4 block">
        <span className="mb-1 block text-[11px] text-muted">{copy.range}</span>
        <select
          value={range}
          onChange={(event) => setRange(event.target.value as HistoryRange)}
          disabled={busy}
          className="w-40 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]"
        >
          {HISTORY_RANGES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <Button onClick={() => void run()} disabled={busy}>
        {busy ? copy.running : copy.run}
      </Button>

      {error && <p className="mt-3 text-[12px] text-negative">{error}</p>}
    </>
  );
}
