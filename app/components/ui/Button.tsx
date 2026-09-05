import type { ButtonHTMLAttributes } from "react";

const BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-30";

const VARIANTS = {
  default: "border border-border hover:bg-surface-2",
  ghost: "text-muted hover:text-text",
} as const;

const SIZES = {
  md: "rounded-md px-3 py-1.5 text-[12px]",
  sm: "rounded-md px-2 py-1.5 text-[12px]",
  icon: "rounded-lg p-2",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
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
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
