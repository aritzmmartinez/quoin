import { Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { es } from "~/lib";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { ingestRequestPending } from "./api";
import {
  ingestCloseIntent,
  resolveClose,
  shouldBounceForcedClose,
} from "./close-guard";
import { IngestStepper, type IngestStatus } from "./IngestStepper";

const IDLE: IngestStatus = { imported: false, atDone: false, importedCount: 0 };

export function IngestModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  const revalidator = useRevalidator();
  const [run, setRun] = useState(0);
  const [status, setStatus] = useState<IngestStatus>(IDLE);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const copy = es.ingest;

  const onCloseAttempt = useCallback(() => {
    const intent = ingestCloseIntent({
      inFlight: ingestRequestPending(),
      imported: status.imported,
      atDone: status.atDone,
    });
    return resolveClose(intent, () => setConfirmingClose(true));
  }, [status.imported, status.atDone]);

  return (
    <>
      <Button
        size="sm"
        onClick={() => dialog.current?.showModal()}
        aria-label={copy.open}
      >
        <Upload size={13} strokeWidth={1.75} aria-hidden />
        {copy.open}
      </Button>

      <Modal
        ref={dialog}
        title={copy.title}
        onCloseAttempt={onCloseAttempt}
        onClose={() => {
          if (shouldBounceForcedClose(ingestRequestPending())) {
            dialog.current?.showModal();
            return;
          }
          setStatus(IDLE);
          setConfirmingClose(false);
          setRun((current) => current + 1);
          void revalidator.revalidate();
        }}
      >
        <div className="relative">
          <IngestStepper
            key={run}
            onStatusChange={setStatus}
            onFinish={() => dialog.current?.close()}
          />

          {confirmingClose && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/95 px-6 py-4 text-center">
              <p className="text-[13px]">
                {copy.closeConfirm.body(status.importedCount)}
              </p>
              <p className="text-[12px] text-muted">{copy.closeConfirm.hint}</p>
              <div className="mt-1 flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingClose(false)}
                >
                  {copy.closeConfirm.keep}
                </Button>
                <Button onClick={() => dialog.current?.close()}>
                  {copy.closeConfirm.close}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
