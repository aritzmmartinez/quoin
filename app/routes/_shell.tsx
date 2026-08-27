import { Outlet, useLoaderData } from "react-router";

import { AppBottomNav, AppHeader, AppSidebar } from "~/components";
import { APP_VERSION } from "~/lib/version.server";

export function loader() {
  return { version: APP_VERSION };
}

export default function Shell() {
  const { version } = useLoaderData<typeof loader>();
  return (
    <div className="min-h-dvh md:flex">
      <AppSidebar version={version} />
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
