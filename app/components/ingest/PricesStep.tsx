import { useState } from "react";

import type { HistoryRange } from "~/core/ports";
import type { PriceFillResult } from "~/lib/ingest";

import { DEFAULT_HISTORY_RANGE, HISTORY_RANGES, useCopy } from "~/lib";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { postIngest } from "./api";

export function PricesStep({
  instrumentIds,
  onDone,
}: {
  instrumentIds: readonly string[];
  onDone: (result: PriceFillResult | null) => void;
}) {
  const t = useCopy();
  const copy = t.ingest.prices;
  const [range, setRange] = useState<HistoryRange>(DEFAULT_HISTORY_RANGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (instrumentIds.length === 0) {
    return <p className="text-[12px] text-muted">{copy.nothing}</p>;
  }

  async function run() {
    setBusy(true);
    setError(null);
    const response = await postIngest(t, {
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

      <div className="mb-4">
        <span aria-hidden className="mb-1 block text-[11px] text-muted">
          {copy.range}
        </span>
        <Select
          label={copy.range}
          value={range}
          onChange={(value) => setRange(value as HistoryRange)}
          options={HISTORY_RANGES.map((option) => ({
            value: option,
            label: option,
          }))}
          disabled={busy}
          className="w-40"
        />
      </div>

      <Button onClick={() => void run()} disabled={busy}>
        {busy ? copy.running : copy.run}
      </Button>

      {error && <p className="mt-3 text-[12px] text-negative">{error}</p>}
    </>
  );
}
