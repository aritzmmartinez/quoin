import { X } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";

import { es } from "~/lib";
import { Button } from "./Button";

export function Modal({
  ref,
  title,
  children,
}: {
  ref: Ref<HTMLDialogElement>;
  title: string;
  children: ReactNode;
}) {
  const id = `modal-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <dialog
      ref={ref}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-labelledby={id}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-border px-gutter py-3">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight">
          {title}
        </h2>
        <form method="dialog">
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label={es.common.close}
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </Button>
        </form>
      </div>

      <div className="max-h-[70dvh] overflow-y-auto px-gutter">{children}</div>
    </dialog>
  );
}
