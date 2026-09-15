import { FileText } from "lucide-react";

import type { Broker, ImportSummary } from "~/adapters/ingestion";

import { useCopy } from "~/lib";
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
  preview: { broker: Broker; summary: ImportSummary } | null;
  imported: boolean;
  busy: boolean;
  onFile: (file: File) => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  const t = useCopy();
  const copy = t.ingest;

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

      <SummaryList summary={preview.summary} />

      {preview.summary.imported === 0 ? (
        <p className="mt-3 text-[12px] text-muted">{copy.nothingNew}</p>
      ) : (
        <p className="mt-3 text-[12px] text-muted">{copy.appliesNow}</p>
      )}

      <div className="mt-4">
        <Button
          onClick={onConfirm}
          disabled={busy || imported || preview.summary.imported === 0}
        >
          {busy ? copy.importing : copy.confirmCount(preview.summary.imported)}
        </Button>
      </div>
    </>
  );
}
