import { BookOpen, ChevronDown } from "lucide-react";
import { useRef } from "react";

import { es } from "~/lib";

import { Modal } from "./Modal";

export function Glossary() {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={es.glossary.open}
        className="rounded-lg p-2 text-muted transition-colors hover:text-text"
      >
        <BookOpen size={18} strokeWidth={1.75} aria-hidden />
      </button>

      <Modal ref={dialog} title={es.glossary.title}>
        {es.glossary.terms.map((entry) => (
          <details
            key={entry.term}
            className="group border-b border-border last:border-b-0"
          >
            <summary className="flex cursor-pointer list-none items-start gap-2 py-3 [&::-webkit-details-marker]:hidden">
              <ChevronDown
                size={14}
                strokeWidth={1.75}
                aria-hidden
                className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-180"
              />
              <span>
                <span className="text-[13px] font-semibold">{entry.term}</span>
                <span className="mt-0.5 block text-[12px] text-muted">
                  {entry.short}
                </span>
              </span>
            </summary>
            <p className="pb-3 pl-6 text-[12px] leading-relaxed text-muted">
              {entry.detail}
            </p>
          </details>
        ))}
      </Modal>
    </>
  );
}
