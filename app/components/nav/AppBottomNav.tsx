import { NavItemLink } from "./NavItemLink";
import { NAV_ITEMS } from "./nav-items";

export function AppBottomNav() {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface md:hidden"
    >
      {NAV_ITEMS.map((item) => (
        <NavItemLink key={item.to} item={item} variant="bottom" />
      ))}
    </nav>
  );
}
