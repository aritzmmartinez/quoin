import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { es, pageHref, type PageInfo } from "~/lib";

export function Pagination({ info }: { info: PageInfo }) {
  const [params] = useSearchParams();
  const copy = es.pagination;

  if (info.pageCount <= 1) return null;

  return (
    <nav
      aria-label={copy.label}
      className="flex items-center justify-between gap-3 border-t border-border px-5 py-3"
    >
      <span className="text-[12px] tabular-nums text-muted">
        {copy.range(info.from, info.to, info.total)}
      </span>

      <div className="flex items-center gap-1">
        <PageLink
          to={pageHref(params, info.page - 1)}
          label={copy.previous}
          disabled={info.page <= 1}
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
        </PageLink>

        <span
          aria-live="polite"
          className="px-2 text-[12px] tabular-nums text-muted"
        >
          {copy.status(info.page, info.pageCount)}
        </span>

        <PageLink
          to={pageHref(params, info.page + 1)}
          label={copy.next}
          disabled={info.page >= info.pageCount}
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  to,
  label,
  disabled,
  children,
}: {
  to: string;
  label: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border transition-colors";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={`${base} cursor-default text-muted opacity-40`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      to={to}
      aria-label={label}
      className={`${base} text-muted hover:bg-surface-2 hover:text-text`}
    >
      {children}
    </Link>
  );
}
