import { useCopy } from "~/lib";

import { NavItemLink } from "./NavItemLink";
import { navItems } from "./nav-items";

export function AppBottomNav() {
  const t = useCopy();

  return (
    <nav
      aria-label={t.a11y.mainNav}
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface md:hidden"
    >
      {navItems(t).map((item) => (
        <NavItemLink key={item.to} item={item} variant="bottom" />
      ))}
    </nav>
  );
}
