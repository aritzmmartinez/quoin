import { useMatches } from "react-router";

import { navItemFor, type NavItem } from "./nav-items";

export function useParentNavItem(): NavItem | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const parent = (matches[i]?.handle as { parent?: string } | undefined)
      ?.parent;
    if (parent) return navItemFor(parent);
  }
  return undefined;
}
