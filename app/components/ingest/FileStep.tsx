import type { Broker, ImportSummary } from "~/adapters/ingestion";

import { es } from "~/lib";
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
}: {
  fileName: string | null;
  preview: { broker: Broker; summary: ImportSummary } | null;
  imported: boolean;
  busy: boolean;
  onFile: (file: File) => void;
  onConfirm: () => void;
}) {
  const copy = es.ingest;

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
      <p className="mb-1 text-[13px]">
        {copy.detected(copy.brokerLabel(preview.broker))}
      </p>
      {fileName && (
        <p className="mb-3 font-mono text-[12px] text-muted">{fileName}</p>
      )}

      <SummaryList summary={preview.summary} />

      {preview.summary.imported === 0 && (
        <p className="mt-3 text-[12px] text-muted">{copy.nothingNew}</p>
      )}

      <div className="mt-4">
        <Button
          onClick={onConfirm}
          disabled={busy || imported || preview.summary.imported === 0}
        >
          {busy ? copy.importing : copy.confirm}
        </Button>
      </div>
    </>
  );
}
