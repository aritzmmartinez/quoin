import { Outlet } from "react-router";

import { AppBottomNav, AppHeader, AppSidebar } from "~/components";

export default function Shell() {
  return (
    <div className="min-h-dvh md:flex">
      <AppSidebar />
      <div className="flex flex-1 flex-col pb-16 md:pb-0">
        <AppHeader />
        <Outlet />
      </div>
      <AppBottomNav />
    </div>
  );
}
