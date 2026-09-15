import { ChevronRight, Settings } from "lucide-react";
import { Link, useMatches, useSearchParams } from "react-router";

import { parseRange, type Copy, type Range, useCopy } from "~/lib";

import { BasisReference } from "../ui/BasisReference";
import { BasisToggle } from "../ui/BasisToggle";
import { Glossary } from "../ui/Glossary";
import { RangeSelector } from "../ui/RangeSelector";

import { useParentNavItem } from "./use-parent-nav-item";

type RouteHandle = {
  title?: (t: Copy, data: unknown) => string;
  range?: boolean;
  basis?: boolean;
};

function useLeafHandles(): { handle: RouteHandle; data: unknown }[] {
  return useMatches().map((match) => ({
    handle: (match.handle ?? {}) as RouteHandle,
    data: match.loaderData,
  }));
}

function useViewTitle(
  matches: { handle: RouteHandle; data: unknown }[],
  t: Copy,
): string {
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    if (match?.handle.title) {
      return match.handle.title(t, match.data);
    }
  }
  return "";
}

interface BasisRouteData {
  real?: {
    active?: boolean;
    reference?: string | null;
    syncedAt?: string | null;
  };
}

function useBasisReference(
  matches: { handle: RouteHandle; data: unknown }[],
): BasisRouteData["real"] | undefined {
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    if (match?.handle.basis !== true) continue;
    return (match.data as BasisRouteData | undefined)?.real;
  }
  return undefined;
}

function Breadcrumb({ title }: { title: string }) {
  const t = useCopy();
  const parent = useParentNavItem();
  const chevron = (
    <ChevronRight
      size={10}
      strokeWidth={1.75}
      aria-hidden
      className="shrink-0 text-faint"
    />
  );

  return (
    <nav
      aria-label={t.a11y.breadcrumb}
      className="flex min-w-0 items-center gap-2"
    >
      {parent?.to && (
        <>
          <Link
            to={parent.to}
            className="shrink-0 text-[13px] text-faint transition-colors hover:text-text"
          >
            {parent.label}
          </Link>
          {chevron}
        </>
      )}
      <h1 className="truncate text-[14px] font-semibold tracking-tight">
        {title}
      </h1>
    </nav>
  );
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
  const t = useCopy();
  const matches = useLeafHandles();
  const title = useViewTitle(matches, t);
  const showRange = matches.some((match) => match.handle.range === true);
  const showBasis = matches.some((match) => match.handle.basis === true);
  const real = useBasisReference(matches);

  return (
    <header className="sticky top-0 z-10 flex h-header items-center justify-between gap-4 bg-bg px-4 md:px-6">
      <Breadcrumb title={title} />
      <div className="flex shrink-0 items-center gap-2">
        {showBasis && (
          <>
            <BasisReference
              active={real?.active ?? false}
              reference={real?.reference ?? null}
              syncedAt={real?.syncedAt ?? null}
            />
            <BasisToggle />
          </>
        )}
        {showRange && <HeaderRangeSelector />}
        <span className="flex items-center gap-2 md:hidden">
          <Glossary />
          <Link
            to="/settings"
            aria-label={t.settings.title}
            className="rounded-lg p-2 text-muted transition-colors hover:text-text"
          >
            <Settings size={18} strokeWidth={1.75} aria-hidden />
          </Link>
        </span>
      </div>
    </header>
  );
}
