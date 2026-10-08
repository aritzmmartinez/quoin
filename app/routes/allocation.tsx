import { Coins, Layers2, type LucideIcon, PieChart, Scale } from "lucide-react";
import { data, Link } from "react-router";

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
  SetupChecklist,
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
  type AllocationView,
  buildRebalancePlan,
  type Copy,
  copyFromMatches,
  currencyByLeaf,
  heldValuesByInstrument,
  isCashLine,
  parseAllocationView,
  parseContribution,
  parseDriftThreshold,
  parseIncludeSold,
  parseOverlapMode,
  parseThreshold,
  readingFor,
  fundsStep,
  pricesStep,
  type SetupStep,
  setupPending,
  targetStep,
  tradesStep,
  tailOf,
  toExposureRows,
  useCopy,
  useFormat,
} from "~/lib";
import { createServerTiming } from "~/lib/server-timing";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.allocation.title },
    { name: "description", content: t.meta.allocation.description },
  ];
}

export const handle = { title: (t: Copy) => t.nav.allocation };

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const view = parseAllocationView(params);
  const threshold = parseThreshold(request.headers.get("Cookie"));
  const contribution = parseContribution(params);
  const driftThreshold = parseDriftThreshold(params);
  const overlapMode = parseOverlapMode(params);
  const includeSold = parseIncludeSold(params);

  const timing = createServerTiming();
  // One after another, not Promise.all: better-sqlite3 is synchronous on a
  // single connection, so the reads never overlapped anyway, and awaited in
  // parallel each step's time would include the steps queued before it.
  const events = await timing.time("db-ledger", () =>
    new PrismaLedgerRepository().list(),
  );
  const instruments = await timing.time("db-instruments", () =>
    new PrismaInstrumentRepository().list(),
  );
  const prices = await timing.time("db-prices-latest", () =>
    new PrismaPriceRepository().latest(),
  );
  const holdings = await timing.time("db-holdings", () =>
    new PrismaHoldingsRepository().all(),
  );
  const identities = await timing.time("db-identities", () =>
    new PrismaSecurityIdentityRepository().all(),
  );
  const targets = await timing.time("db-targets", () =>
    new PrismaTargetRepository().list(),
  );

  const canonical = timing.time("identity-map", () => {
    const map = new Map<string, string>();
    for (const entry of identities.values()) {
      if (entry.resolution.status === "resolved") {
        map.set(entry.value, entry.resolution.canonicalId);
      }
    }
    return map;
  });

  const positions = timing.time("positions", () => computePositions(events));
  const marketValues = timing.time("valuation", () =>
    computeMarketValues(positions, prices, BASE_CURRENCY),
  );

  const resolutions = timing.time(
    "look-through",
    () =>
      new Map<string, WeightedLeaf[]>(
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
      ),
  );

  const exposures = timing.time("exposures", () =>
    computeExposures(
      positions,
      marketValues,
      resolutions,
      new Map(instruments.map((i) => [i.id, i.name])),
    ),
  );
  const summary = timing.time("summarize", () => summarizeExposures(exposures));
  const rows = timing.time("rows", () =>
    toExposureRows(exposures, summary.total),
  );
  const tail = timing.time("tail", () => tailOf(exposures, summary.total));
  const reading = timing.time("reading", () =>
    readingFor(rows, summary.resolvedLeafCount, threshold),
  );

  const target = getActiveTarget(targets, new Date());

  const hedged = new Set(
    instruments.filter((i) => i.hedgedToBase).map((i) => i.id),
  );

  const withHoldings = instruments.filter(
    (instrument) => (holdings.get(instrument.id) ?? []).length > 0,
  );
  const held = heldValuesByInstrument(positions, marketValues);
  const heldIds = includeSold ? null : new Set(held.keys());
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

  const overlap =
    view !== "overlap"
      ? null
      : {
          mode: overlapMode,
          includeSold,
          funds: overlapInstruments.map(({ id, name }) => ({ id, name })),
          pairs: timing.time("overlap", () =>
            computeAllFundOverlaps(overlapFunds, isCashLine),
          ),
        };
  const currency =
    view !== "currency"
      ? null
      : timing.time("currency", () =>
          computeCurrencyExposure({
            exposures,
            currencyByLeaf: currencyByLeaf(identities),
            hedgedInstruments: hedged,
            base: BASE_CURRENCY,
          }),
        );

  const plan =
    view !== "rebalance" || target === null || contribution === null
      ? null
      : timing.time("rebalance", () =>
          buildRebalancePlan(
            target,
            positions,
            marketValues,
            instruments,
            contribution,
            driftThreshold,
          ),
        );

  const trades = tradesStep(events.length > 0);
  const priced = pricesStep(
    [...held.values()].some((value) => !value.unpriced),
  );
  const setup: SetupStep[] =
    view === "overlap"
      ? [trades, fundsStep(withHoldings.length)]
      : view === "rebalance"
        ? [trades, priced, targetStep(target !== null)]
        : [trades, priced];

  return data(
    {
      setup,
      overlap,
      currency,
      hedgedCount: hedged.size,
      rows,
      tail,
      reading,
      summary,
      threshold,
      view,
      driftThreshold,
      hasTarget: target !== null,
      plan,
    },
    { headers: timing.headers() },
  );
}

const SETUP_ICONS: Record<AllocationView, LucideIcon> = {
  exposure: PieChart,
  currency: Coins,
  overlap: Layers2,
  rebalance: Scale,
};

export default function Allocation({ loaderData }: Route.ComponentProps) {
  const { formatMoney, formatPercent } = useFormat();
  const t = useCopy();
  const {
    setup,
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
  const copy = t.allocation;

  const unresolvedShare =
    Number(summary.total) === 0
      ? "0"
      : String(Number(summary.unresolved) / Number(summary.total));

  if (setupPending(setup)) {
    const screen = t.setup.screens[view];
    return (
      <>
        <ViewTabs value={view} />
        <Card>
          <SetupChecklist
            icon={SETUP_ICONS[view]}
            title={screen.title}
            body={screen.body}
            steps={setup}
          />
        </Card>
      </>
    );
  }

  if (view === "currency" && currency !== null) {
    return (
      <>
        <ViewTabs value={view} />
        <CurrencyPanel exposure={currency} hedgedCount={hedgedCount} />
      </>
    );
  }

  if (view === "overlap" && overlap !== null) {
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

  if (view === "rebalance") {
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
            <Link
              to="/settings"
              title={copy.thresholdEdit}
              className="flex items-center gap-2 text-[11.5px] text-muted transition-colors hover:text-text"
            >
              <span>{copy.thresholdMark}</span>
              <span className="font-mono">{formatPercent(threshold, 0)}</span>
            </Link>
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
