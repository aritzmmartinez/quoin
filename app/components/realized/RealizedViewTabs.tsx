import { Link, useSearchParams } from "react-router";

import { REALIZED_VIEWS, es, realizedViewHref, type RealizedView } from "~/lib";

export function RealizedViewTabs({ value }: { value: RealizedView }) {
  const [params] = useSearchParams();
  const copy = es.realized.views;

  return (
    <nav
      aria-label={copy.label}
      className="mb-4 inline-flex rounded-lg border border-border p-0.5"
    >
      {REALIZED_VIEWS.map((view) => (
        <Link
          key={view}
          to={realizedViewHref(params, view)}
          aria-current={value === view ? "page" : undefined}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
            value === view
              ? "bg-surface-2 text-text"
              : "text-muted hover:text-text"
          }`}
        >
          {copy[view]}
        </Link>
      ))}
    </nav>
  );
}
