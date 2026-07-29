import { es } from "~/lib";

export function PortfolioEmpty() {
  return (
    <div className="px-6 py-16 text-center">
      <div className="text-[15px] font-semibold">
        {es.portfolio.empty.title}
      </div>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
        {es.portfolio.empty.body}
      </p>
    </div>
  );
}
