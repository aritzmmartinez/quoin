import { Outlet } from "react-router";

import { AppBottomNav, AppHeader, AppSidebar } from "~/components";

export default function Shell() {
  return (
    <div className="min-h-dvh md:flex">
      <AppSidebar />
      <div className="flex flex-1 flex-col pb-16 md:pb-0">
        <AppHeader />
        <main className="px-4 py-8 md:px-6">
          <Outlet />
        </main>
      </div>
      <AppBottomNav />
    </div>
  );
}
