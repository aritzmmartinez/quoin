import { BookOpen, ChevronDown } from "lucide-react";
import { useRef } from "react";

import { useCopy } from "~/lib";

import { Modal } from "./Modal";
import { Button } from "./Button";

export function Glossary({
  variant = "icon",
  className = "",
}: {
  variant?: "icon" | "nav";
  className?: string;
}) {
  const t = useCopy();
  const dialog = useRef<HTMLDialogElement>(null);
  const open = () => dialog.current?.showModal();

  return (
    <>
      {variant === "nav" ? (
        <button
          type="button"
          onClick={open}
          className={`${className} text-muted hover:bg-surface`}
        >
          <BookOpen
            size={18}
            strokeWidth={1.75}
            aria-hidden
            className="shrink-0"
          />
          <span>{t.glossary.title}</span>
        </button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={open}
          aria-label={t.glossary.open}
        >
          <BookOpen size={18} strokeWidth={1.75} aria-hidden />
        </Button>
      )}

      <Modal ref={dialog} title={t.glossary.title}>
        {t.glossary.terms.map((entry) => (
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
