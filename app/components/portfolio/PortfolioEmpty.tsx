import { useCopy } from "~/lib";

export function PortfolioEmpty() {
  const t = useCopy();
  return (
    <div className="px-6 py-16 text-center">
      <div className="text-[15px] font-semibold">{t.portfolio.empty.title}</div>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
        {t.portfolio.empty.body}
      </p>
    </div>
  );
}
