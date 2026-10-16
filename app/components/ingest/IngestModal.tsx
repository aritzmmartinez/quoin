import { Upload } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { useCopy } from "~/lib";
import { Button, type ButtonProps } from "../ui/Button";
import { asFocusable, returnFocus, type Focusable } from "../ui/focus-return";
import { Modal } from "../ui/Modal";
import { ingestRequestPending } from "./api";
import {
  focusAfterBounce,
  ingestCloseIntent,
  resolveClose,
  shouldBounceForcedClose,
} from "./close-guard";
import { IngestStepper, type IngestStatus } from "./IngestStepper";

const IDLE: IngestStatus = { imported: false, atDone: false, importedCount: 0 };

export function IngestModal({
  variant = "default",
  size = "sm",
}: Pick<ButtonProps, "variant" | "size">) {
  const t = useCopy();
  const dialog = useRef<HTMLDialogElement>(null);
  const revalidator = useRevalidator();
  const [run, setRun] = useState(0);
  const [status, setStatus] = useState<IngestStatus>(IDLE);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const confirmId = `ingest-close-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const keepButton = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Focusable | null>(null);
  const closeConfirmed = useRef(false);

  const copy = t.ingest;

  useEffect(() => {
    if (confirmingClose) keepButton.current?.focus();
  }, [confirmingClose]);

  const keep = useCallback(() => {
    returnFocus(returnTo.current);
    setConfirmingClose(false);
  }, []);

  const onCloseAttempt = useCallback(() => {
    if (!confirmingClose) {
      returnTo.current = asFocusable(document.activeElement);
    }
    const intent = ingestCloseIntent({
      inFlight: ingestRequestPending(),
      imported: status.imported,
      atDone: status.atDone,
      confirming: confirmingClose,
    });
    return resolveClose(intent, {
      confirm: () => setConfirmingClose(true),
      keep,
    });
  }, [status.imported, status.atDone, confirmingClose, keep]);

  return (
    <>
      <Button
        variant={variant}
        size={size}
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
          if (
            shouldBounceForcedClose({
              inFlight: ingestRequestPending(),
              imported: status.imported,
              atDone: status.atDone,
              closeConfirmed: closeConfirmed.current,
            })
          ) {
            dialog.current?.showModal();
            returnFocus(
              focusAfterBounce<Focusable>(
                confirmingClose,
                keepButton.current,
                returnTo.current,
              ),
            );
            return;
          }
          closeConfirmed.current = false;
          returnTo.current = null;
          setStatus(IDLE);
          setConfirmingClose(false);
          setRun((current) => current + 1);
          void revalidator.revalidate();
        }}
      >
        <IngestStepper
          key={run}
          onStatusChange={setStatus}
          onFinish={() => dialog.current?.close()}
        />

        {confirmingClose && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-describedby={confirmId}
              className="flex w-full max-w-sm flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-4 text-center"
            >
              <p id={confirmId} className="text-[13px]">
                {copy.closeConfirm.body(status.importedCount)}
              </p>
              <p className="text-[12px] text-muted">{copy.closeConfirm.hint}</p>
              <div className="mt-1 flex gap-2">
                <Button ref={keepButton} variant="primary" onClick={keep}>
                  {copy.closeConfirm.keep}
                </Button>
                <Button
                  onClick={() => {
                    closeConfirmed.current = true;
                    dialog.current?.close();
                  }}
                >
                  {copy.closeConfirm.close}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
