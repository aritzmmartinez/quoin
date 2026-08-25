import { Check } from "lucide-react";
import type { ReactNode } from "react";

export function Checkbox({
  name,
  value = "1",
  defaultChecked = false,
  checked,
  onChange,
  children,
  className = "",
}: {
  name: string;
  value?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`group inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-text has-checked:bg-surface-2 has-checked:text-text has-focus-visible:border-text ${className}`}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        {...(checked === undefined
          ? { defaultChecked }
          : {
              checked,
              onChange: (event) => onChange?.(event.target.checked),
            })}
        className="sr-only"
      />
      <span
        aria-hidden
        className="grid size-4 shrink-0 place-items-center rounded-[5px] border border-border transition-colors group-has-checked:border-text group-has-checked:bg-text"
      >
        <Check
          size={10}
          strokeWidth={3.25}
          className="text-bg opacity-0 transition-opacity group-has-checked:opacity-100"
        />
      </span>
      {children}
    </label>
  );
}
