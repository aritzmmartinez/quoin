import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { es, formatDate, formatPeriod, todayInMadrid } from "~/lib";

import { addDays, addMonths, monthGrid, monthOf } from "./calendar";
import { placePopover } from "./popover-place";

const TRIGGER =
  "flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-surface px-2.5 text-left text-[13px] transition-colors";

const PANEL =
  "m-0 inset-auto w-fit max-w-[calc(100vw-32px)] rounded-xl border border-border bg-surface-2 p-2 shadow-lg [&:popover-open]:flex [&:popover-open]:flex-col [&:popover-open]:gap-2";

const NAV =
  "flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-text";

const CELL =
  "flex size-8 items-center justify-center rounded-md font-mono text-[12px] tabular-nums transition-colors";

export function DatePicker({
  name,
  label,
  defaultValue = "",
  required = false,
  className = "",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const copy = es.datePicker;
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(defaultValue) ?? "");
  const [focusDay, setFocusDay] = useState<string | null>(null);

  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || focusDay === null) return;
    panel.current
      ?.querySelector<HTMLElement>(`[data-iso="${focusDay}"]`)
      ?.focus();
  }, [open, focusDay, month]);

  function place() {
    const anchor = trigger.current?.getBoundingClientRect();
    const box = panel.current;
    if (!anchor || !box) return;

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
      setFocusDay(null);
      const active = document.activeElement;
      if (active === null || active === document.body) trigger.current?.focus();
      return;
    }

    const start = value === "" ? todayInMadrid() : value;
    setMonth(monthOf(start) ?? todayInMadrid().slice(0, 7));
    setFocusDay(start);
    requestAnimationFrame(place);
  }

  function commit(iso: string) {
    setValue(iso);
    panel.current?.hidePopover();
  }

  function move(event: React.KeyboardEvent<HTMLDivElement>) {
    const from = focusDay;
    if (from === null) return;

    const step =
      event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp"
            ? -7
            : event.key === "ArrowDown"
              ? 7
              : event.key === "PageUp"
                ? "prev"
                : event.key === "PageDown"
                  ? "next"
                  : null;
    if (step === null) return;

    event.preventDefault();
    const next =
      step === "prev"
        ? addMonths(from.slice(0, 7), -1) + from.slice(7)
        : step === "next"
          ? addMonths(from.slice(0, 7), 1) + from.slice(7)
          : addDays(from, step);

    setFocusDay(next);
    setMonth(monthOf(next) ?? month);
  }

  const today = open ? todayInMadrid() : "";
  const days = open && month !== "" ? monthGrid(month) : [];
  const weeks = Array.from({ length: days.length / 7 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );

  return (
    <>
      <input type="hidden" name={name} value={value} />

      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => panel.current?.togglePopover()}
        className={`${TRIGGER} ${open ? "border-accent" : "border-border hover:border-faint"} ${className}`}
      >
        <span className={value === "" ? "text-muted" : ""}>
          {value === "" ? copy.placeholder : formatDate(value)}
        </span>
        <CalendarDays
          size={13}
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
        role="dialog"
        aria-label={label}
        className={PANEL}
      >
        {open && month !== "" && (
          <>
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label={copy.prevMonth}
                onClick={() => setMonth(addMonths(month, -1))}
                className={NAV}
              >
                <ChevronLeft size={14} strokeWidth={1.75} aria-hidden />
              </button>

              <span
                aria-live="polite"
                className="text-[12px] font-medium first-letter:uppercase"
              >
                {formatPeriod(month)}
              </span>

              <button
                type="button"
                aria-label={copy.nextMonth}
                onClick={() => setMonth(addMonths(month, 1))}
                className={NAV}
              >
                <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <div role="grid" aria-label={label} className="flex flex-col">
              <div role="row" className="flex">
                {copy.weekdays.map((initial, i) => (
                  <abbr
                    key={initial + String(i)}
                    role="columnheader"
                    title={copy.weekdayNames[i]}
                    className={`${CELL} text-[11px] font-medium text-faint no-underline`}
                  >
                    {initial}
                  </abbr>
                ))}
              </div>

              {weeks.map((week) => (
                <div key={week[0]} role="row" className="flex">
                  {week.map((iso) => {
                    const outside = iso.slice(0, 7) !== month;
                    const selected = iso === value;
                    return (
                      <span key={iso} role="gridcell" aria-selected={selected}>
                        <button
                          type="button"
                          data-iso={iso}
                          tabIndex={iso === focusDay ? 0 : -1}
                          aria-label={formatDate(iso)}
                          aria-current={iso === today ? "date" : undefined}
                          onFocus={() => setFocusDay(iso)}
                          onClick={() => commit(iso)}
                          className={`${CELL} ${
                            selected
                              ? "bg-accent font-medium text-on-accent"
                              : `hover:bg-surface ${outside ? "text-faint" : "text-body"} ${iso === today ? "ring-1 ring-border" : ""}`
                          }`}
                        >
                          {Number(iso.slice(8))}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
              <button
                type="button"
                onClick={() => commit(today)}
                className="rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:bg-surface hover:text-text"
              >
                {copy.today}
              </button>

              {value !== "" && !required && (
                <button
                  type="button"
                  onClick={() => commit("")}
                  className="rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  {copy.clear}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
