import type { Route } from "./+types/allocation";

import {
  PrismaHoldingsRepository,
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { Card, ExposureBars, PortfolioError, ReadingCard } from "~/components";
import {
  BASE_CURRENCY,
  resolveWithHoldings,
  type WeightedLeaf,
} from "~/core/domain";
import {
  computeExposures,
  computeMarketValues,
  computePositions,
  summarizeExposures,
} from "~/core/projections";
import {
  es,
  formatMoney,
  formatPercent,
  parseThreshold,
  readingFor,
  tailOf,
  toExposureRows,
} from "~/lib";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Asignación · Quoin" },
    { name: "description", content: "Exposición real con look-through" },
  ];
}

export const handle = { title: es.nav.allocation };

export async function loader({ request }: Route.LoaderArgs) {
  const threshold = parseThreshold(new URL(request.url).searchParams);

  const [events, instruments, prices, holdings] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().latest(),
    new PrismaHoldingsRepository().all(),
  ]);

  const positions = computePositions(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);

  const resolutions = new Map<string, WeightedLeaf[]>(
    instruments.map((instrument) => [
      instrument.id,
      resolveWithHoldings(
        instrument,
        (holdings.get(instrument.id) ?? []).map((h) => ({
          identity: h.identity,
          name: h.name,
          weight: h.weight,
        })),
      ),
    ]),
  );

  const exposures = computeExposures(positions, marketValues, resolutions);
  const summary = summarizeExposures(exposures);
  const rows = toExposureRows(exposures, summary.total);

  return {
    rows,
    tail: tailOf(exposures, summary.total),
    reading: readingFor(rows, summary.resolvedLeafCount, threshold),
    summary,
    threshold,
  };
}

export default function Allocation({ loaderData }: Route.ComponentProps) {
  const { rows, tail, reading, summary, threshold } = loaderData;
  const copy = es.allocation;

  const unresolvedShare =
    Number(summary.total) === 0
      ? "0"
      : String(Number(summary.unresolved) / Number(summary.total));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ReadingCard reading={reading} threshold={threshold} />
          <Card className="p-6">
            <div className="mb-3.5 text-[11px] uppercase tracking-[0.08em] text-muted">
              {copy.stats.total}
            </div>
            <div className="text-[22px] font-semibold tracking-[-0.02em]">
              {formatMoney(summary.total)}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Line
                label={copy.stats.leaves}
                value={String(summary.resolvedLeafCount)}
              />
              <Line
                label={copy.stats.unresolved}
                value={`${formatPercent(unresolvedShare, 1)} · ${formatMoney(summary.unresolved)}`}
              />
              {tail.count > 0 && (
                <Line
                  label={copy.stats.tail(tail.count)}
                  value={`${formatPercent(tail.weight ?? "0", 1)} · ${formatMoney(tail.value)}`}
                />
              )}
            </div>
            {Number(summary.unresolved) < 0 && (
              <p className="mt-3 text-[11.5px] leading-[1.5] text-muted">
                {copy.stats.negativeUnresolved}
              </p>
            )}
          </Card>
        </div>

        <Card className="min-w-0 p-6">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold">{copy.title}</h2>
            <span className="text-[11.5px] text-muted">
              {copy.thresholdMark(formatPercent(threshold, 0))}
            </span>
          </div>
          <p className="mb-4 text-[12.5px] text-muted">{copy.intro}</p>
          <ExposureBars rows={rows} threshold={threshold} />
        </Card>
      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <Card>
        <PortfolioError onRetry={() => window.location.reload()} />
      </Card>
    </main>
  );
}
