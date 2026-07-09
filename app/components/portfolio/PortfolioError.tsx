import { es } from "~/lib";

export function PortfolioError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="m-5 flex flex-wrap items-center gap-4 rounded-xl border border-negative/35 bg-negative/6 px-5 py-4">
      <div className="min-w-50 flex-1">
        <div className="text-[13.5px] font-medium">
          {es.portfolio.error.title}
        </div>
        <div className="mt-0.5 text-[12.5px] text-muted">
          {es.portfolio.error.body}
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface-2"
        >
          {es.portfolio.error.retry}
        </button>
      )}
    </div>
  );
}
