import { Info } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";

import { placePopover } from "./popover-place";

const PANEL =
  "m-0 inset-auto w-max max-w-[min(320px,calc(100vw-48px))] rounded-xl border border-border bg-surface-2 px-4 py-3.5 text-[12px] font-normal normal-case leading-[1.55] tracking-normal text-body shadow-lg [text-wrap:pretty] [&:popover-open]:flex [&:popover-open]:flex-col [&:popover-open]:gap-2.5";

export function Hint({
  label,
  name,
  children,
  className = "",
}: {
  label: ReactNode;
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
    const { left, top } = placePopover({
      anchor,
      panel: { width, height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });

    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  const pinned = useRef(false);
  const show = () => panel.current?.showPopover();
  const hide = () => {
    if (!pinned.current) panel.current?.hidePopover();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={name}
        aria-expanded={undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => {
          pinned.current = !pinned.current;
          if (pinned.current) show();
          else panel.current?.hidePopover();
        }}
        className={`cursor-help text-left transition-colors hover:text-text ${className}`}
      >
        {children}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="tooltip"
        onToggle={(event) => {
          if (event.newState !== "open") pinned.current = false;
          place(event);
        }}
        className={PANEL}
      >
        {label}
      </div>
    </>
  );
}

export function InfoHint({
  label,
  name,
  size = 22,
  className = "",
}: {
  label: ReactNode;
  name: string;
  size?: 18 | 22;
  className?: string;
}) {
  return (
    <Hint
      label={label}
      name={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-faint ${
        size === 22 ? "size-5.5" : "size-4.5"
      } ${className}`}
    >
      <Info size={size === 22 ? 14 : 13} strokeWidth={1.5} aria-hidden />
    </Hint>
  );
}
