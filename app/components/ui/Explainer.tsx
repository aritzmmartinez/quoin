import type { ReactNode } from "react";

const TONE = {
  intro: "text-[12px] text-muted",
  notice:
    "rounded-card border border-border bg-surface-2 px-3 py-2 text-[12px] text-muted",
  footnote: "text-[11px] leading-relaxed text-muted",
} as const;

export function Explainer({
  tone = "intro",
  className = "",
  children,
}: {
  tone?: keyof typeof TONE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={`max-w-[70ch] ${TONE[tone]} ${className}`}>{children}</p>
  );
}
