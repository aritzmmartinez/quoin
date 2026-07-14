import { NavItemLink } from "./NavItemLink";
import { NAV_ITEMS } from "./nav-items";

import { es } from "~/lib";

export function AppSidebar() {
  return (
    <aside className="hidden shrink-0 md:sticky md:top-0 md:flex md:h-dvh md:w-52 md:flex-col md:self-start md:border-r md:border-border md:bg-surface">
      <div className="px-4 py-5">
        <span className="text-[15px] font-semibold tracking-tight">
          {es.nav.brand}
        </span>
      </div>
      <nav aria-label="Principal" className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => (
          <NavItemLink key={item.label} item={item} variant="sidebar" />
        ))}
      </nav>
    </aside>
  );
}
