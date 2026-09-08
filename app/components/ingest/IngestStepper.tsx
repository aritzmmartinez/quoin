import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { Broker, ImportSummary } from "~/adapters/ingestion";
import type { PendingMapping, PriceFillResult } from "~/lib/ingest";

import { es } from "~/lib";
import { postIngest } from "./api";
import { DoneStep } from "./DoneStep";
import { FileStep } from "./FileStep";
import { MappingStep } from "./MappingStep";
import { PricesStep } from "./PricesStep";
import { STAGES, StepNav, type Stage } from "./StepNav";
import { StepperNav } from "./StepperNav";

interface Loaded {
  name: string;
  csv: string;
}

export interface IngestStatus {
  imported: boolean;
  atDone: boolean;
  importedCount: number;
}

export function IngestStepper({
  onFinish,
  onStatusChange,
}: {
  onFinish: () => void;
  onStatusChange?: (status: IngestStatus) => void;
}) {
  const copy = es.ingest;

  const [stage, setStage] = useState<Stage>("file");
  const [reached, setReached] = useState<Stage>("file");
  const [file, setFile] = useState<Loaded | null>(null);
  const [preview, setPreview] = useState<{
    broker: Broker;
    summary: ImportSummary;
  } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, setPending] = useState<PendingMapping[]>([]);
  const [mapped, setMapped] = useState<Record<string, string>>({});
  const [fill, setFill] = useState<PriceFillResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function go(next: Stage): void {
    setStage(next);
    if (STAGES.indexOf(next) > STAGES.indexOf(reached)) setReached(next);
  }

  useEffect(() => {
    onStatusChange?.({
      imported: summary !== null,
      atDone: stage === "done",
      importedCount: summary?.imported ?? 0,
    });
  }, [summary, stage, onStatusChange]);

  async function read(dropped: File): Promise<void> {
    setError(null);
    setBusy(copy.analysing);
    let csv: string;
    try {
      csv = await dropped.text();
    } catch {
      setBusy(null);
      setError(copy.unreadable);
      return;
    }

    setFile({ name: dropped.name, csv });
    const response = await postIngest({ intent: "preview", csv });
    setBusy(null);

    if (!response.ok) {
      setError(response.error);
      return;
    }
    if (response.step === "preview") {
      setPreview({ broker: response.broker, summary: response.summary });
    }
  }

  async function commit(): Promise<void> {
    if (!file) return;
    setError(null);
    setBusy(copy.importing);
    const response = await postIngest({ intent: "commit", csv: file.csv });
    setBusy(null);

    if (!response.ok) {
      setError(response.error);
      return;
    }
    if (response.step !== "commit") return;

    setSummary(response.summary);
    setPending(response.pending);
    go(response.pending.length === 0 ? "prices" : "mapping");
  }

  function reset(): void {
    setFile(null);
    setPreview(null);
    setError(null);
  }

  const mappedIds = Object.keys(mapped);
  const unmapped = pending.length - mappedIds.length;
  const index = STAGES.indexOf(stage);

  const canGoBack = index > 0 || (preview !== null && summary === null);

  function previous(): void {
    if (index === 0) {
      reset();
      return;
    }
    setError(null);
    go(STAGES[index - 1]!);
  }

  function next(): void {
    setError(null);
    if (stage === "done") {
      onFinish();
      return;
    }
    if (stage === "prices") setFill(null);
    go(STAGES[index + 1]!);
  }

  return (
    <div className="pb-4">
      <StepNav
        stage={stage}
        reached={reached}
        onGo={go}
        disabled={busy !== null}
      />

      <div className="relative border-t border-border pt-4">
        {stage === "file" && (
          <FileStep
            fileName={file?.name ?? null}
            preview={preview}
            imported={summary !== null}
            busy={busy !== null}
            onFile={(dropped) => void read(dropped)}
            onConfirm={() => void commit()}
          />
        )}

        {stage === "mapping" && (
          <MappingStep
            pending={pending}
            mapped={mapped}
            onMapped={(instrumentId, symbol) =>
              setMapped((current) => ({ ...current, [instrumentId]: symbol }))
            }
          />
        )}

        {stage === "prices" && (
          <PricesStep
            instrumentIds={mappedIds}
            onDone={(result) => {
              setFill(result);
              go("done");
            }}
          />
        )}

        {stage === "done" && summary && (
          <DoneStep summary={summary} fill={fill} unmapped={unmapped} />
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/80 text-[12px] text-muted">
            <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
            {busy}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-[12px] text-negative">{error}</p>}

      <StepperNav
        onPrevious={previous}
        onNext={next}
        nextLabel={stage === "done" ? copy.finish : copy.next}
        canGoBack={canGoBack}
        canGoNext={stage !== "file" || summary !== null}
        disabled={busy !== null}
      />
    </div>
  );
}
