import { NavLink } from "react-router";

import type { NavItem } from "./nav-items";

import { es } from "~/lib";

import { useParentNavItem } from "./BackLink";

type Variant = "sidebar" | "bottom";

export function NavItemLink({
  item,
  variant,
}: {
  item: NavItem;
  variant: Variant;
}) {
  const Icon = item.icon;
  const isBottom = variant === "bottom";
  const size = isBottom ? 20 : 18;
  const inSection = useParentNavItem()?.to === item.to;

  if (item.to === null) {
    return (
      <span
        aria-disabled="true"
        className={
          isBottom
            ? "flex flex-1 cursor-default select-none flex-col items-center gap-1 py-2 text-[11px] text-muted opacity-50"
            : "flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-muted"
        }
      >
        <Icon size={size} strokeWidth={1.75} aria-hidden />
        <span>{item.label}</span>
        {!isBottom && (
          <span className="ml-auto rounded-full border border-border px-1.5 py-0.5 text-[10px] tracking-wide">
            {es.nav.soon}
          </span>
        )}
      </span>
    );
  }

  if (isBottom) {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors ${
            isActive || inSection ? "text-text" : "text-muted"
          }`
        }
      >
        <Icon size={size} strokeWidth={1.75} aria-hidden />
        <span>{item.label}</span>
      </NavLink>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors ${
          isActive || inSection
            ? "bg-surface-2 text-text"
            : "text-muted hover:text-text"
        }`
      }
    >
      <Icon size={size} strokeWidth={1.75} aria-hidden />
      <span>{item.label}</span>
    </NavLink>
  );
}
