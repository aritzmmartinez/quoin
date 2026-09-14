import type { ButtonHTMLAttributes } from "react";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-30";

const VARIANTS = {
  default: "border border-border bg-surface text-text hover:bg-surface-2",
  primary: "border border-accent bg-accent font-semibold text-on-accent",
  ghost: "text-muted hover:text-text",
} as const;

const SIZES = {
  md: "h-[34px] rounded-md px-3.5 text-[13px]",
  sm: "h-8 rounded-md px-3 text-[12px]",
  icon: "size-[30px] rounded-md",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function buttonClass(
  variant: keyof typeof VARIANTS = "default",
  size: keyof typeof SIZES = "md",
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant = "default",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClass(variant, size)} ${className}`}
      {...props}
    />
  );
}
