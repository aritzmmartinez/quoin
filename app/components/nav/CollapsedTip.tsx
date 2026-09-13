import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function CollapsedTip({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    setAt(null);
  }

  return (
    <span
      className="contents"
      onMouseEnter={(event) => {
        if (!enabled) return;
        const box =
          event.currentTarget.firstElementChild?.getBoundingClientRect();
        if (box) setAt({ left: box.right + 8, top: box.top + box.height / 2 });
      }}
      onMouseLeave={() => setAt(null)}
    >
      {children}
      {enabled &&
        at &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-50 flex -translate-y-1/2 items-center"
            style={{ left: at.left, top: at.top }}
          >
            <span
              aria-hidden
              className="size-0 border-y-[5px] border-r-[5px] border-y-transparent border-r-border"
            />
            <span className="-ml-px whitespace-nowrap rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] font-medium text-text shadow-lg">
              {label}
            </span>
          </span>,
          document.body,
        )}
    </span>
  );
}
