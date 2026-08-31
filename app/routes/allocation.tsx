import type { Route } from "./+types/allocation";

import {
  PrismaHoldingsRepository,
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  PrismaSecurityIdentityRepository,
  PrismaTargetRepository,
} from "~/adapters/persistence";
import {
  Card,
  CurrencyPanel,
  ExposureBars,
  OverlapPanel,
  ReadingCard,
  RebalancePanel,
  ViewTabs,
} from "~/components";
import {
  BASE_CURRENCY,
  canonicaliseLeaves,
  getActiveTarget,
  resolveWithHoldings,
  type WeightedLeaf,
} from "~/core/domain";
import {
  computeAllFundOverlaps,
  computeCurrencyExposure,
  computeExposures,
  computeMarketValues,
  computePositions,
  summarizeExposures,
} from "~/core/projections";
import {
  buildRebalancePlan,
  currencyByLeaf,
  es,
  formatMoney,
  formatPercent,
  heldValuesByInstrument,
  isCashLine,
  parseAllocationView,
  parseContribution,
  parseDriftThreshold,
  parseIncludeSold,
  parseOverlapMode,
  parseThreshold,
  readingFor,
  tailOf,
  toExposureRows,
} from "~/lib";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Asignación · Quoin" },
    { name: "description", content: "Exposición real por transparencia" },
  ];
}

export const handle = { title: es.nav.allocation };

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const view = parseAllocationView(params);
  const threshold = parseThreshold(params);
  const contribution = parseContribution(params);
  const driftThreshold = parseDriftThreshold(params);
  const overlapMode = parseOverlapMode(params);
  const includeSold = parseIncludeSold(params);

  const [events, instruments, prices, holdings, identities, targets] =
    await Promise.all([
      new PrismaLedgerRepository().list(),
      new PrismaInstrumentRepository().list(),
      new PrismaPriceRepository().latest(),
      new PrismaHoldingsRepository().all(),
      new PrismaSecurityIdentityRepository().all(),
      new PrismaTargetRepository().list(),
    ]);

  const canonical = new Map<string, string>();
  for (const entry of identities.values()) {
    if (entry.resolution.status === "resolved") {
      canonical.set(entry.value, entry.resolution.canonicalId);
    }
  }

  const positions = computePositions(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);

  const resolutions = new Map<string, WeightedLeaf[]>(
    instruments.map((instrument) => [
      instrument.id,
      canonicaliseLeaves(
        resolveWithHoldings(
          instrument,
          (holdings.get(instrument.id) ?? []).map((h) => ({
            identity: h.identity,
            name: h.name,
            weight: h.weight,
          })),
        ),
        canonical,
      ),
    ]),
  );

  const exposures = computeExposures(
    positions,
    marketValues,
    resolutions,
    new Map(instruments.map((i) => [i.id, i.name])),
  );
  const summary = summarizeExposures(exposures);
  const rows = toExposureRows(exposures, summary.total);

  const target = getActiveTarget(targets, new Date());

  const hedged = new Set(
    instruments.filter((i) => i.hedgedToBase).map((i) => i.id),
  );

  const withHoldings = instruments.filter(
    (instrument) => (holdings.get(instrument.id) ?? []).length > 0,
  );
  const heldIds = includeSold
    ? null
    : new Set(heldValuesByInstrument(positions, marketValues).keys());
  const overlapInstruments =
    heldIds === null
      ? withHoldings
      : withHoldings.filter((instrument) => heldIds.has(instrument.id));
  const overlapFunds = new Map<string, WeightedLeaf[]>(
    overlapInstruments.map((instrument) => [
      instrument.id,
      resolutions.get(instrument.id) ?? [],
    ]),
  );

  return {
    overlap:
      view !== "solapamiento"
        ? null
        : {
            mode: overlapMode,
            includeSold,
            funds: overlapInstruments.map(({ id, name }) => ({ id, name })),
            pairs: computeAllFundOverlaps(overlapFunds, isCashLine),
          },
    currency:
      view !== "divisa"
        ? null
        : computeCurrencyExposure({
            exposures,
            currencyByLeaf: currencyByLeaf(identities),
            hedgedInstruments: hedged,
            base: BASE_CURRENCY,
          }),
    hedgedCount: hedged.size,
    rows,
    tail: tailOf(exposures, summary.total),
    reading: readingFor(rows, summary.resolvedLeafCount, threshold),
    summary,
    threshold,
    view,
    driftThreshold,
    hasTarget: target !== null,
    plan:
      view !== "rebalanceo" || target === null || contribution === null
        ? null
        : buildRebalancePlan(
            target,
            positions,
            marketValues,
            instruments,
            contribution,
            driftThreshold,
          ),
  };
}

export default function Allocation({ loaderData }: Route.ComponentProps) {
  const {
    rows,
    tail,
    reading,
    summary,
    threshold,
    view,
    driftThreshold,
    plan,
    hasTarget,
    currency,
    hedgedCount,
    overlap,
  } = loaderData;
  const copy = es.allocation;

  const unresolvedShare =
    Number(summary.total) === 0
      ? "0"
      : String(Number(summary.unresolved) / Number(summary.total));

  if (view === "divisa" && currency !== null) {
    return (
      <>
        <ViewTabs value={view} />
        <CurrencyPanel exposure={currency} hedgedCount={hedgedCount} />
      </>
    );
  }

  if (view === "solapamiento" && overlap !== null) {
    return (
      <>
        <ViewTabs value={view} />
        <OverlapPanel
          funds={overlap.funds}
          pairs={overlap.pairs}
          mode={overlap.mode}
          includeSold={overlap.includeSold}
        />
      </>
    );
  }

  if (view === "rebalanceo") {
    return (
      <>
        <ViewTabs value={view} />
        <RebalancePanel
          plan={plan}
          hasTarget={hasTarget}
          driftThreshold={driftThreshold}
        />
      </>
    );
  }

  return (
    <>
      <ViewTabs value={view} />
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
              <p className="mt-3 text-[11.5px] leading-normal text-muted">
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
    </>
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

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
