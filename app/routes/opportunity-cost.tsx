import type { Route } from "./+types/opportunity-cost";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import {
  Card,
  OpportunityTable,
  PortfolioError,
  SignedMoney,
  StatTile,
  signClass,
  signedPercent,
} from "~/components";
import {
  es,
  formatDate,
  formatMoney,
  formatSignedMoney,
  namesOf,
  toOpportunityRows,
} from "~/lib";
import { loadOpportunityCost } from "~/lib/opportunity-cost.server";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Coste de oportunidad · Quoin" },
    {
      name: "description",
      content: "Tus flujos reales, comprados en el índice",
    },
  ];
}

export const handle = { title: es.opportunity.title };

export async function loader(_: Route.LoaderArgs) {
  const [events, instruments, prices] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().latest(),
  ]);

  const view = await loadOpportunityCost(events, instruments, prices);
  if (!view.ok) {
    return { ok: false as const, symbol: view.symbol, reason: view.reason };
  }

  const { result } = view;
  return {
    ok: true as const,
    symbol: view.symbol,
    benchmarkName: view.benchmarkName,
    totals: {
      realValue: result.realValue,
      benchmarkValue: result.benchmarkValue,
      difference: result.difference,
      realizedProceeds: result.realizedProceeds,
      realMwr: result.realMwr,
      benchmarkMwr: result.benchmarkMwr,
      mwrDifference: result.mwrDifference,
    },
    rows: toOpportunityRows(result.lines, instruments),
    unpriced: namesOf(result.unpricedInstrumentIds, instruments),
    truncated: result.truncated,
  };
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 max-w-3xl rounded-card border border-border bg-surface-2 px-3 py-2 text-[12px] text-muted">
      {children}
    </p>
  );
}

export default function OpportunityCost({ loaderData }: Route.ComponentProps) {
  const o = es.opportunity;

  if (!loaderData.ok) {
    return (
      <Card>
        <div className="px-6 py-16 text-center">
          <div className="text-[15px] font-semibold">{o.title}</div>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">
            {loaderData.reason === "unmapped"
              ? o.unmapped(loaderData.symbol)
              : o.noHistory(loaderData.symbol)}
          </p>
        </div>
      </Card>
    );
  }

  const { symbol, totals, rows, unpriced, truncated } = loaderData;

  return (
    <>
      <header className="mb-4">
        <p className="max-w-3xl text-[12px] text-muted">{o.intro(symbol)}</p>
        <Notice>{o.taxWarning}</Notice>
      </header>

      {rows.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center">
            <div className="text-[15px] font-semibold">{o.empty.title}</div>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
              {o.empty.body}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div
            className="mb-3 grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            }}
          >
            <StatTile
              label={o.stats.real.label}
              sub={o.stats.real.sub}
              value={formatMoney(totals.realValue)}
            />
            <StatTile
              label={o.stats.benchmark.label}
              sub={o.stats.benchmark.sub}
              value={formatMoney(totals.benchmarkValue)}
            />
            <StatTile
              label={o.stats.difference.label}
              sub={o.stats.difference.sub}
              value={formatSignedMoney(totals.difference).text}
              valueClass={signClass(totals.difference)}
            />
          </div>

          <div
            className="mb-4 grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            }}
          >
            <StatTile
              label={o.stats.realMwr.label}
              sub={
                totals.realMwr === null
                  ? o.stats.unavailable
                  : o.stats.realMwr.sub
              }
              value={signedPercent(totals.realMwr)}
              valueClass={signClass(totals.realMwr)}
            />
            <StatTile
              label={o.stats.benchmarkMwr.label}
              sub={
                totals.benchmarkMwr === null
                  ? o.stats.unavailable
                  : o.stats.benchmarkMwr.sub
              }
              value={signedPercent(totals.benchmarkMwr)}
              valueClass={signClass(totals.benchmarkMwr)}
            />
            <StatTile
              label={o.stats.mwrDifference.label}
              sub={
                totals.mwrDifference === null
                  ? o.stats.unavailable
                  : o.stats.mwrDifference.sub
              }
              value={signedPercent(totals.mwrDifference)}
              valueClass={signClass(totals.mwrDifference)}
            />
          </div>

          {truncated && (
            <Notice>
              {o.truncated(
                symbol,
                formatDate(truncated.earliestDay),
                truncated.excludedFlowCount,
                formatMoney(truncated.excludedAmount),
              )}
            </Notice>
          )}
          {unpriced.length > 0 && (
            <Notice>{o.unpriced(unpriced.join(", "))}</Notice>
          )}
          {totals.realizedProceeds !== "0" && (
            <Notice>{o.proceeds(formatMoney(totals.realizedProceeds))}</Notice>
          )}

          <Card className="mt-4">
            <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-[14px] font-semibold">{o.table.title}</h2>
              <span className="text-[13px] tabular-nums">
                <SignedMoney value={totals.difference} />
              </span>
            </div>
            <OpportunityTable rows={rows} />
          </Card>

          <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-muted">
            {o.table.note} {o.nominal}
          </p>
        </>
      )}
    </>
  );
}

export function ErrorBoundary() {
  return (
    <Card>
      <PortfolioError onRetry={() => window.location.reload()} />
    </Card>
  );
}
