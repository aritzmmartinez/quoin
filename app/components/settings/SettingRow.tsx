import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function SettingRow({
  icon: Icon,
  label,
  hint,
  soon,
  detail,
  children,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  soon?: string;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-4 px-4 py-3 not-first:border-t not-first:border-border-subtle">
      <Icon
        size={18}
        strokeWidth={1.75}
        aria-hidden
        className="shrink-0 text-muted"
      />
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[13px] font-medium">
          {label}
          {soon && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-faint">
              {soon}
            </span>
          )}
        </span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
        {detail}
      </div>
      {children}
    </div>
  );
}
