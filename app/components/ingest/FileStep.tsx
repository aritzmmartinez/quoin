import { FileText } from "lucide-react";

import {
  nothingToImport,
  operationsToWrite,
} from "~/adapters/ingestion/ingest";
import { importAction, useCopy, useFormat, type IngestPreview } from "~/lib";
import { Button } from "../ui/Button";
import { FileDropzone } from "../ui/FileDropzone";
import { SummaryList } from "./SummaryList";

export function FileStep({
  fileName,
  preview,
  imported,
  busy,
  onFile,
  onConfirm,
  onReset,
}: {
  fileName: string | null;
  preview: IngestPreview | null;
  imported: boolean;
  busy: boolean;
  onFile: (file: File) => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  const t = useCopy();
  const copy = t.ingest;
  const newCount = preview ? operationsToWrite(preview.summary) : 0;
  const action = preview ? importAction(preview.summary) : "nothing";
  const canImport = action !== "nothing";

  if (preview === null) {
    return (
      <>
        <FileDropzone
          accept=".csv,text/csv"
          label={copy.drop}
          hint={copy.dropHint}
          fileName={fileName}
          disabled={busy}
          onFile={onFile}
        />
        <p className="mt-2 text-[11px] text-muted">{copy.volatile}</p>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-3.5 rounded-card border border-border bg-surface p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent/15 text-accent">
          <FileText size={18} strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-mono text-[13px] font-semibold">
            {fileName}
          </span>
          <span className="text-[11px] leading-none text-muted">
            {copy.detected(copy.brokerLabel(preview.broker))}
          </span>
        </div>
        <Button size="sm" onClick={onReset} disabled={busy || imported}>
          {copy.change}
        </Button>
      </div>

      <SummaryList
        broker={preview.broker}
        summary={preview.summary}
        pendingPrice
      />

      <RateConflicts conflicts={preview.rateConflicts} />

      {!canImport ? (
        <p className="mt-3 text-[12px] text-muted">
          {nothingToImport(preview.summary) === "already-stored"
            ? copy.nothingNew
            : copy.nothingToSave}
        </p>
      ) : (
        <p className="mt-3 text-[12px] text-muted">{copy.appliesNow}</p>
      )}

      <div className="mt-4">
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={busy || imported || !canImport}
        >
          {busy
            ? copy.importing
            : action === "value-unpriced"
              ? copy.confirmPending
              : copy.confirmCount(newCount)}
        </Button>
      </div>
    </>
  );
}

function RateConflicts({
  conflicts,
}: {
  conflicts: IngestPreview["rateConflicts"];
}) {
  const copy = useCopy().ingest.rateConflict;
  const { formatCalendarDate, formatQuantity } = useFormat();
  if (conflicts.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-3 text-[12px] text-negative">
      <p>{copy.title([...new Set(conflicts.map((c) => c.currency))])}</p>
      <ul className="mt-2 font-mono">
        {conflicts.map((c) => (
          <li key={`${c.currency}-${c.day}`}>
            {copy.line(
              c.currency,
              formatCalendarDate(c.day),
              formatQuantity(c.stored),
              formatQuantity(c.incoming),
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
