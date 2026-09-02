import type { Route } from "./+types/opportunity-cost";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import {
  Card,
  NoteLink,
  OpportunityTable,
  Explainer,
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

export const handle = { title: es.opportunity.title, parent: "/" };

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
        <Explainer>{o.intro(symbol)}</Explainer>
        <Explainer tone="notice" className="mt-2">
          {o.taxWarning}
        </Explainer>
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
            <Explainer tone="notice" className="mt-2">
              {o.truncated(
                symbol,
                formatDate(truncated.earliestDay),
                truncated.excludedFlowCount,
                formatMoney(truncated.excludedAmount),
              )}
            </Explainer>
          )}
          {unpriced.length > 0 && (
            <Explainer tone="notice" className="mt-2">
              {o.unpriced(unpriced.join(", "))}
            </Explainer>
          )}
          {totals.realizedProceeds !== "0" && (
            <Explainer tone="notice" className="mt-2">
              {o.proceeds(formatMoney(totals.realizedProceeds))}
            </Explainer>
          )}

          <Card className="mt-4">
            <div className="flex items-baseline justify-between gap-3 border-b border-border px-gutter py-3">
              <h2 className="text-[14px] font-semibold">{o.table.title}</h2>
              <span className="text-[13px] tabular-nums">
                <SignedMoney value={totals.difference} />
              </span>
            </div>
            <OpportunityTable rows={rows} />
          </Card>

          <NoteLink
            title={o.table.noteTitle}
            className="mt-2 text-[11px] text-muted"
          >
            <div className="flex flex-col gap-2 py-4 text-[12px] leading-relaxed text-muted">
              <p>{o.table.note}</p>
              <p>{o.nominal}</p>
            </div>
          </NoteLink>
        </>
      )}
    </>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
