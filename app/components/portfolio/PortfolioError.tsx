import { es } from "~/lib";
import { Button } from "../ui/Button";

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
      {onRetry && <Button onClick={onRetry}>{es.portfolio.error.retry}</Button>}
    </div>
  );
}
