import { Scale } from "lucide-react";
import { Link } from "react-router";

import type { Route } from "./+types/opportunity-cost";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import {
  Card,
  EmptyState,
  IngestModal,
  OpportunityTable,
  Explainer,
  SignedMoney,
  StatTile,
  signClass,
  signedPercent,
  InfoHint,
} from "~/components";
import { buttonClass } from "~/components/ui/Button";
import {
  type Copy,
  copyFromMatches,
  namesOf,
  parseBenchmark,
  toOpportunityRows,
  useCopy,
  useFormat,
} from "~/lib";
import { loadOpportunityCost } from "~/lib/opportunity-cost.server";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.opportunity.title },
    { name: "description", content: t.meta.opportunity.description },
  ];
}

export const handle = { title: (t: Copy) => t.opportunity.title, parent: "/" };

export async function loader({ request }: Route.LoaderArgs) {
  const [events, instruments, prices] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().latest(),
  ]);

  const view = await loadOpportunityCost(
    events,
    instruments,
    prices,
    parseBenchmark(request.headers.get("Cookie")),
  );
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
  const { formatMoney, formatSignedMoney, formatDate, formatPercent } =
    useFormat();
  const t = useCopy();
  const o = t.opportunity;

  if (!loaderData.ok) {
    return (
      <Card>
        <EmptyState
          icon={Scale}
          title={o.title}
          body={
            loaderData.reason === "unmapped"
              ? o.unmapped(loaderData.symbol)
              : o.noHistory(loaderData.symbol)
          }
        >
          <Link to="/settings" className={buttonClass()}>
            {o.chooseBenchmark}
          </Link>
        </EmptyState>
      </Card>
    );
  }

  const { symbol, totals, rows, unpriced, truncated } = loaderData;

  return (
    <>
      <header className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span>
          {o.headlinePre} <span className="font-mono text-text">{symbol}</span>{" "}
          {o.headlinePost}
        </span>
        <InfoHint
          name={o.about}
          label={
            <>
              <span>{o.intro(symbol)}</span>
              <span className="text-muted">{o.taxWarning}</span>
            </>
          }
        />
      </header>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Scale} title={o.empty.title} body={o.empty.body}>
            <IngestModal variant="primary" size="md" />
          </EmptyState>
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
              hint={
                totals.realizedProceeds === "0"
                  ? undefined
                  : {
                      name: o.stats.real.label,
                      label: o.proceeds(formatMoney(totals.realizedProceeds)),
                    }
              }
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
              value={signedPercent(formatPercent, totals.realMwr)}
              valueClass={signClass(totals.realMwr)}
            />
            <StatTile
              label={o.stats.benchmarkMwr.label}
              sub={
                totals.benchmarkMwr === null
                  ? o.stats.unavailable
                  : o.stats.benchmarkMwr.sub
              }
              value={signedPercent(formatPercent, totals.benchmarkMwr)}
              valueClass={signClass(totals.benchmarkMwr)}
            />
            <StatTile
              label={o.stats.mwrDifference.label}
              sub={
                totals.mwrDifference === null
                  ? o.stats.unavailable
                  : o.stats.mwrDifference.sub
              }
              value={signedPercent(formatPercent, totals.mwrDifference)}
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

          <Card className="mt-4">
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-gutter py-4">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[14px] font-semibold">{o.table.title}</h2>
                <InfoHint
                  size={18}
                  name={o.table.noteTitle}
                  label={
                    <>
                      <span>{o.table.note}</span>
                      <span className="text-muted">{o.nominal}</span>
                    </>
                  }
                />
              </div>
              <span className="font-mono text-[13px]">
                <SignedMoney value={totals.difference} />
              </span>
            </div>
            <OpportunityTable rows={rows} />
          </Card>
        </>
      )}
    </>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
