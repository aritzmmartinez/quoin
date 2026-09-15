import { Check, ChevronDown, Search } from "lucide-react";
import { useRef, useState } from "react";

import { useCopy } from "~/lib";

import { placePopover } from "./popover-place";

export interface SelectOption {
  value: string;
  label: string;
  desc?: string;
}

const TRIGGER =
  "flex h-8 min-w-30 items-center justify-between gap-2 rounded-md border bg-bg pl-3 pr-2.5 font-mono text-[12px] font-medium transition-colors";

const PANEL =
  "m-0 inset-auto max-w-[min(280px,calc(100vw-32px))] rounded-xl border border-border bg-surface-2 p-1.5 shadow-lg [&:popover-open]:flex [&:popover-open]:flex-col [&:popover-open]:gap-0.5";

const OPTION =
  "flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors";

export function Select({
  value,
  options,
  onChange,
  label,
  searchPlaceholder,
  disabled = false,
  className = "",
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  label: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useCopy();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);
  const q = query.trim().toLowerCase();
  const shown =
    searchPlaceholder === undefined || q === ""
      ? options
      : options.filter(
          (option) =>
            option.label.toLowerCase().includes(q) ||
            (option.desc ?? "").toLowerCase().includes(q),
        );

  function place() {
    const anchor = trigger.current?.getBoundingClientRect();
    const box = panel.current;
    if (!anchor || !box) return;

    box.style.minWidth = `${anchor.width}px`;
    const { width, height } = box.getBoundingClientRect();

    const { left, top } = placePopover({
      anchor,
      panel: { width, height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      align: "start",
      margin: 4,
    });
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  function onToggle(event: React.ToggleEvent<HTMLDivElement>) {
    const opening = event.newState === "open";
    setOpen(opening);

    if (!opening) {
      setQuery("");
      const active = document.activeElement;
      if (active === null || active === document.body) trigger.current?.focus();
      return;
    }

    place();

    requestAnimationFrame(() => {
      const box = panel.current;
      if (!box) return;
      place();
      const target =
        box.querySelector<HTMLElement>("input") ??
        box.querySelector<HTMLElement>('[aria-selected="true"]') ??
        box.querySelector<HTMLElement>('[role="option"]');
      target?.focus();
    });
  }

  function move(event: React.KeyboardEvent<HTMLDivElement>) {
    const box = panel.current;
    if (!box) return;
    const items = [...box.querySelectorAll<HTMLElement>('[role="option"]')];
    if (items.length === 0) return;

    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (at + 1) % items.length
            : event.key === "ArrowUp"
              ? at <= 0
                ? items.length - 1
                : at - 1
              : null;
    if (next === null) return;

    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => panel.current?.togglePopover()}
        className={`${TRIGGER} disabled:opacity-40 ${open ? "border-accent" : "border-border enabled:hover:border-faint"} ${className}`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 text-faint"
        />
      </button>

      <div
        ref={panel}
        popover="auto"
        onToggle={onToggle}
        onKeyDown={move}
        className={PANEL}
      >
        {searchPlaceholder !== undefined && (
          <div className="mb-1 flex h-8 items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-muted">
            <Search
              size={13}
              strokeWidth={1.6}
              aria-hidden
              className="shrink-0"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none"
            />
          </div>
        )}

        <div
          role="listbox"
          aria-label={label}
          className="flex max-h-65 flex-col gap-0.5 overflow-y-auto"
        >
          {shown.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                panel.current?.hidePopover();
              }}
              className={`${OPTION} ${
                option.value === value ? "bg-accent/15" : "hover:bg-surface"
              }`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-mono text-[12px] font-medium">
                  {option.label}
                </span>

                {option.desc !== undefined && (
                  <span className="text-[11px] leading-snug text-muted text-pretty">
                    {option.desc}
                  </span>
                )}
              </span>
              <Check
                size={14}
                strokeWidth={1.8}
                aria-hidden
                className={`shrink-0 text-accent ${option.value === value ? "" : "invisible"}`}
              />
            </button>
          ))}

          {shown.length === 0 && (
            <div className="px-2.5 py-4 text-center text-[12px] text-muted">
              {t.select.empty}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
