import { ChevronLeft } from "lucide-react";
import { Link, useMatches } from "react-router";

import { navItemFor, type NavItem } from "./nav-items";

/**
 * The sidebar section the current route belongs to, declared by the deepest
 * match with `handle.parent`. The route tree is flat — every route is a sibling
 * under `_shell` — so a subpage's parent is a product fact, not a URL prefix.
 */
export function useParentNavItem(): NavItem | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const parent = (matches[i]?.handle as { parent?: string } | undefined)
      ?.parent;
    if (parent) return navItemFor(parent);
  }
  return undefined;
}

/** Renders nothing on a route that is itself a sidebar item. */
export function BackLink() {
  const parent = useParentNavItem();
  if (!parent?.to) return null;

  return (
    <Link
      to={parent.to}
      className="mb-3 flex w-fit items-center gap-1 text-[12.5px] text-muted transition-colors hover:text-text"
    >
      <ChevronLeft size={14} strokeWidth={2} aria-hidden />
      {parent.label}
    </Link>
  );
}
