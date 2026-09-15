import { useMatches } from "react-router";

import { useCopy } from "~/lib";

import { navItemFor, type NavItem } from "./nav-items";

export function useParentNavItem(): NavItem | undefined {
  const t = useCopy();
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const parent = (matches[i]?.handle as { parent?: string } | undefined)
      ?.parent;
    if (parent) return navItemFor(t, parent);
  }
  return undefined;
}
