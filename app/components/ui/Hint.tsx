import { useId, useRef, type ReactNode } from "react";

const PANEL =
  "m-0 inset-auto w-max max-w-[min(17rem,calc(100vw-2rem))] rounded-md border border-border bg-surface-2 p-3 text-[12px] font-normal normal-case leading-[1.55] tracking-normal text-text shadow-lg";

export function Hint({
  label,
  name,
  children,
  className = "",
}: {
  label: string;
  name?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = `hint-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  function place(event: React.ToggleEvent<HTMLDivElement>) {
    if (event.newState !== "open") return;
    const anchor = trigger.current?.getBoundingClientRect();
    const box = panel.current;
    if (!anchor || !box) return;

    const { width, height } = box.getBoundingClientRect();
    const margin = 8;

    const below = anchor.bottom + margin;
    const top =
      below + height > window.innerHeight && anchor.top - height - margin > 0
        ? anchor.top - height - margin
        : below;

    const left = Math.min(
      Math.max(margin, anchor.left + anchor.width / 2 - width / 2),
      window.innerWidth - width - margin,
    );

    box.style.left = `${left}px`;
    box.style.top = `${Math.min(top, window.innerHeight - height - margin)}px`;
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={id}
        aria-label={name}
        className={`cursor-help text-left transition-colors hover:text-text ${className}`}
      >
        {children}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="tooltip"
        onToggle={place}
        className={PANEL}
      >
        {label}
      </div>
    </>
  );
}
