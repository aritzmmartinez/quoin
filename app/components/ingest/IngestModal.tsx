import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { es } from "~/lib";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { IngestStepper } from "./IngestStepper";

export function IngestModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  const revalidator = useRevalidator();
  const [run, setRun] = useState(0);

  return (
    <>
      <Button
        size="sm"
        onClick={() => dialog.current?.showModal()}
        aria-label={es.ingest.open}
      >
        <Upload size={13} strokeWidth={1.75} aria-hidden />
        {es.ingest.open}
      </Button>

      <Modal
        ref={dialog}
        title={es.ingest.title}
        onClose={() => {
          setRun((current) => current + 1);
          void revalidator.revalidate();
        }}
      >
        <IngestStepper key={run} onFinish={() => dialog.current?.close()} />
      </Modal>
    </>
  );
}
