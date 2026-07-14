import { useMatches } from "react-router";

import { ThemeToggle } from "../ui/ThemeToggle";

type RouteHandle = { title?: string | ((data: unknown) => string) };

function useViewTitle(): string {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const handle = match?.handle as RouteHandle | undefined;
    if (match && handle?.title) {
      return typeof handle.title === "function"
        ? handle.title(match.loaderData)
        : handle.title;
    }
  }
  return "";
}

export function AppHeader() {
  const title = useViewTitle();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-bg px-4 md:px-6">
      <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
      <ThemeToggle />
    </header>
  );
}
