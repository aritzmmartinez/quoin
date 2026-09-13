import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { InfoHint } from "./Hint";

const TONE = {
  raised: "rounded-card border-border bg-surface",
  inset: "rounded-xl border-border-subtle bg-bg",
} as const;

interface Common {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  subClass?: string;
  tone?: keyof typeof TONE;
}

type Props = Common &
  (
    | { to: string; hint?: never }
    | { to?: undefined; hint?: { name: string; label: ReactNode } }
  );

export function StatTile({
  label,
  value,
  sub,
  valueClass = "",
  subClass = "",
  tone = "raised",
  to,
  hint,
}: Props) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] leading-none text-muted">{label}</span>
        {hint && <InfoHint size={18} name={hint.name} label={hint.label} />}
      </div>
      <div
        className={`font-mono text-[20px] font-semibold leading-none tracking-tight ${valueClass}`}
      >
        {value}
      </div>
      {sub && (
        <div className={`text-[11px] leading-snug text-muted ${subClass}`}>
          {sub}
        </div>
      )}
    </>
  );

  const shell = `relative flex min-w-0 flex-col gap-2 border p-4 ${TONE[tone]}`;

  if (!to) return <div className={shell}>{body}</div>;

  return (
    <Link to={to} className={`${shell} transition-colors hover:border-faint`}>
      <ArrowUpRight
        size={12}
        strokeWidth={1.75}
        aria-hidden
        className="absolute right-4 top-4 text-faint"
      />
      {body}
    </Link>
  );
}
