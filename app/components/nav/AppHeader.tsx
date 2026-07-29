import { useMatches, useSearchParams } from "react-router";

import { parseRange, type Range } from "~/lib";

import { RangeSelector } from "../ui/RangeSelector";
import { ThemeToggle } from "../ui/ThemeToggle";

type RouteHandle = {
  title?: string | ((data: unknown) => string);
  range?: boolean;
};

function useLeafHandles(): { handle: RouteHandle; data: unknown }[] {
  return useMatches().map((match) => ({
    handle: (match.handle ?? {}) as RouteHandle,
    data: match.loaderData,
  }));
}

function useViewTitle(
  matches: { handle: RouteHandle; data: unknown }[],
): string {
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    if (match?.handle.title) {
      return typeof match.handle.title === "function"
        ? match.handle.title(match.data)
        : match.handle.title;
    }
  }
  return "";
}

function HeaderRangeSelector() {
  const [searchParams, setSearchParams] = useSearchParams();
  const range = parseRange(searchParams);

  const onChange = (next: Range) => {
    const params = new URLSearchParams(searchParams);
    params.set("range", next);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  return <RangeSelector value={range} onChange={onChange} />;
}

export function AppHeader() {
  const matches = useLeafHandles();
  const title = useViewTitle(matches);
  const showRange = matches.some((match) => match.handle.range === true);

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg px-4 md:px-6">
      <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-2">
        {showRange && <HeaderRangeSelector />}
        <ThemeToggle />
      </div>
    </header>
  );
}
