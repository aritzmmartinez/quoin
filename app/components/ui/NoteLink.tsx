import { useRef, type ReactNode } from "react";

import { Modal } from "./Modal";

export function NoteLink({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={`underline transition-colors hover:text-text ${className}`}
      >
        {title}
      </button>

      <Modal ref={dialog} title={title}>
        {children}
      </Modal>
    </>
  );
}
