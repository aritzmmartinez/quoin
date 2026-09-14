import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { NavLink } from "react-router";

import { Glossary } from "../ui/Glossary";

import { CollapsedTip } from "./CollapsedTip";
import { useParentNavItem } from "./use-parent-nav-item";
import { NavItemLink } from "./NavItemLink";
import { NAV_GROUPS, SUMMARY_SUBVIEWS, SYSTEM_ITEMS } from "./nav-items";
import { FOLD, sidebarRow } from "./sidebar-row";

import { es } from "~/lib";

function BrandMark() {
  return (
    <span
      aria-hidden
      className="relative block size-8 shrink-0 overflow-hidden rounded-[9px] bg-accent"
    >
      <span className="absolute left-2 top-2 block size-4 rounded-sm border-[2.5px] border-on-accent" />
      <span className="absolute left-4.25 top-4.25 block size-2.5 bg-accent" />
    </span>
  );
}

function SubViews({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        {SUMMARY_SUBVIEWS.map((sub) => (
          <CollapsedTip key={sub.to} label={sub.label} enabled>
            <NavLink
              to={sub.to}
              aria-label={sub.label}
              className={({ isActive }) =>
                `flex size-6 items-center justify-center rounded-md transition-colors hover:bg-surface ${
                  isActive ? "bg-accent/15" : ""
                }`
              }
            >
              {({ isActive }) => (
                <span
                  aria-hidden
                  className={`block size-1.5 rounded-full ${
                    isActive ? "bg-accent" : "bg-faint"
                  }`}
                />
              )}
            </NavLink>
          </CollapsedTip>
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-px pl-6">
      <span
        aria-hidden
        className="absolute inset-y-1 left-4.25 w-px bg-border"
      />
      {SUMMARY_SUBVIEWS.map((sub) => (
        <NavLink
          key={sub.to}
          to={sub.to}
          className={({ isActive }) =>
            `relative flex h-8 items-center truncate rounded-md px-2 text-[12.5px] font-medium transition-colors hover:bg-surface ${
              isActive ? "text-text" : "text-muted"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden
                className={`absolute inset-y-2 -left-px w-px ${
                  isActive ? "bg-accent" : "bg-transparent"
                }`}
              />
              {sub.label}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

function GroupTitle({
  title,
  collapsed,
}: {
  title: string;
  collapsed: boolean;
}) {
  return (
    <span className="flex h-4.5 items-center px-2 pb-2">
      {collapsed ? (
        <span aria-hidden className="h-px w-full bg-border-subtle" />
      ) : (
        <span className="text-[10px] font-medium uppercase tracking-widest text-faint">
          {title}
        </span>
      )}
    </span>
  );
}

export function AppSidebar({ version }: { version: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const inSubView = useParentNavItem()?.to === "/";

  const toggle = () => setCollapsed((c) => !c);

  return (
    <aside
      className={`hidden shrink-0 overflow-hidden border-r border-border-subtle transition-[width] ${FOLD} md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:self-start md:px-2 md:py-4 ${
        collapsed ? "md:w-14.5" : "md:w-61"
      }`}
    >
      <div className="mb-3 flex h-10 items-center gap-3 px-1">
        <BrandMark />
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight">
          {es.nav.brand}
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-label={es.nav.collapse}
          tabIndex={collapsed ? -1 : undefined}
          aria-hidden={collapsed || undefined}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface hover:text-text"
        >
          <ChevronLeft size={12} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div
        className={`shrink-0 overflow-hidden transition-[height] ${FOLD} ${
          collapsed ? "h-10" : "h-0"
        }`}
      >
        <CollapsedTip label={es.nav.expand} enabled={collapsed}>
          <button
            type="button"
            onClick={toggle}
            aria-label={es.nav.expand}
            tabIndex={collapsed ? undefined : -1}
            aria-hidden={!collapsed || undefined}
            className="flex h-8 w-full items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-text"
          >
            <ChevronRight size={12} strokeWidth={1.75} aria-hidden />
          </button>
        </CollapsedTip>
      </div>

      <nav
        aria-label="Principal"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <GroupTitle collapsed={collapsed} title={group.title} />
            {group.items.map((item) => (
              <Fragment key={item.label}>
                <CollapsedTip label={item.label} enabled={collapsed}>
                  <NavItemLink
                    item={item}
                    variant="sidebar"
                    collapsed={collapsed}
                  />
                </CollapsedTip>
                {item.to === "/" && inSubView && (
                  <SubViews collapsed={collapsed} />
                )}
              </Fragment>
            ))}
          </div>
        ))}

        <div className="mt-auto flex flex-col gap-0.5">
          <GroupTitle collapsed={collapsed} title={es.nav.groups.system} />
          {SYSTEM_ITEMS.map((item) => (
            <CollapsedTip
              key={item.label}
              label={item.label}
              enabled={collapsed}
            >
              <NavItemLink
                item={item}
                variant="sidebar"
                collapsed={collapsed}
              />
            </CollapsedTip>
          ))}
          <CollapsedTip label={es.glossary.title} enabled={collapsed}>
            <Glossary variant="nav" className={sidebarRow(collapsed)} />
          </CollapsedTip>
        </div>
      </nav>

      {!collapsed && (
        <span className="mt-4 px-2 font-mono text-[10px] text-faint">
          {es.nav.version(version)}
        </span>
      )}
    </aside>
  );
}
