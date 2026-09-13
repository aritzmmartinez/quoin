import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const TONES = {
  negative: "border-negative/30 bg-negative/10 text-negative",
  neutral: "border-border bg-surface text-muted",
} as const;

const FRAMES = {
  shell: "min-h-[calc(100dvh-var(--spacing-header)-4rem)]",
  viewport: "min-h-dvh",
} as const;

export interface ErrorStateProps {
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  frame?: keyof typeof FRAMES;
  title: string;
  body: string;
  footnote?: string;
  children?: ReactNode;
}

export function ErrorState({
  icon: Icon,
  tone = "negative",
  frame = "shell",
  title,
  body,
  footnote,
  children,
}: ErrorStateProps) {
  return (
    <div
      className={`flex ${FRAMES[frame]} flex-col items-center justify-center gap-4 px-6 py-16 text-center`}
    >
      <span
        className={`flex size-14 items-center justify-center rounded-full border ${TONES[tone]}`}
      >
        <Icon size={26} strokeWidth={1.4} aria-hidden />
      </span>

      <div className="flex max-w-105 flex-col gap-2">
        <span className="text-[16px] font-semibold tracking-[-0.01em]">
          {title}
        </span>
        <span className="text-pretty text-[13px] leading-relaxed text-muted">
          {body}
        </span>
      </div>

      {children && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      )}

      {footnote && (
        <span
          suppressHydrationWarning
          className="font-mono text-[11px] text-faint"
        >
          {footnote}
        </span>
      )}
    </div>
  );
}
