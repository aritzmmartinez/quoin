import { Outlet } from "react-router";

import { AppBottomNav, AppSidebar } from "~/components";

export default function Shell() {
  return (
    <div className="min-h-dvh md:flex">
      <AppSidebar />
      <div className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </div>
      <AppBottomNav />
    </div>
  );
}
