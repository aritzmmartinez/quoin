import { NavLink } from "react-router";

import type { NavItem } from "./nav-items";

import { useCopy } from "~/lib";

import { sidebarRow } from "./sidebar-row";
import { useParentNavItem } from "./use-parent-nav-item";

type Variant = "sidebar" | "bottom";

function Marker({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-y-2 -left-2 w-0.5 rounded-r-sm ${
        on ? "bg-accent" : "bg-transparent"
      }`}
    />
  );
}

export function NavItemLink({
  item,
  variant,
  collapsed = false,
}: {
  item: NavItem;
  variant: Variant;
  collapsed?: boolean;
}) {
  const t = useCopy();
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
            : "flex h-9 cursor-default select-none items-center gap-3 rounded-md px-2 text-[13px] text-muted"
        }
      >
        <Icon size={size} strokeWidth={1.75} aria-hidden />
        <span>{item.label}</span>
        {!isBottom && (
          <span className="ml-auto rounded-full border border-border px-1.5 py-0.5 text-[10px] tracking-wide">
            {t.nav.soon}
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
        `${sidebarRow(collapsed)} hover:bg-surface ${
          isActive
            ? "bg-accent/15 text-text"
            : inSection
              ? "text-text"
              : "text-muted"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Marker on={isActive} />
          <Icon
            size={size}
            strokeWidth={1.75}
            aria-hidden
            className={`shrink-0 ${isActive ? "text-accent" : ""}`}
          />
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}
