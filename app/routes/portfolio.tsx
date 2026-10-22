import Decimal from "decimal.js";
import { useNavigation } from "react-router";

import type { Route } from "./+types/portfolio";

import {
  Card,
  Explainer,
  IngestModal,
  PortfolioEmpty,
  PortfolioTable,
  SignedMoney,
  SyncPricesButton,
} from "~/components";
import { UnratedNotice } from "~/components/ui/UnratedNotice";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
} from "~/adapters/persistence";
import { BASE_CURRENCY } from "~/core/domain";
import { unconvertibleInstrumentIds } from "~/core/fx";
import {
  computeMarketValues,
  computePositions,
  computeTradeMeta,
} from "~/core/projections";
import {
  type Copy,
  copyFor,
  copyFromMatches,
  intlTag,
  namesOf,
  parseLocale,
  parseSort,
  sortPortfolioRows,
  splitUnmapped,
  toPortfolioRows,
  toSyncTargets,
  totalInvested,
  totalMarketValue,
  totalUnrealizedPnL,
  useCopy,
  useFormat,
} from "~/lib";
import { loadValuation } from "~/lib/rate-book.server";
import { unratedNames } from "~/lib/unrated";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.portfolio.title },
    { name: "description", content: t.meta.portfolio.description },
  ];
}

export const handle = { title: (t: Copy) => t.portfolio.title };

export async function loader({ request }: Route.LoaderArgs) {
  const sort = parseSort(new URL(request.url).searchParams);
  const locale = parseLocale(request.headers.get("Cookie"));

  const [events, instruments, valuation] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    loadValuation(),
  ]);
  const { latest: prices } = valuation;

  const positions = computePositions(events);
  const tradeMeta = computeTradeMeta(events);
  const marketValues = computeMarketValues(
    positions,
    valuation.prices,
    BASE_CURRENCY,
  );

  const rows = sortPortfolioRows(
    toPortfolioRows(positions, instruments, tradeMeta, marketValues),
    sort,
    copyFor(locale).labels,
    locale,
  );

  let updatedAt: string | null = null;
  for (const row of rows) {
    const snapshot = prices.get(row.instrumentId);
    if (snapshot && (!updatedAt || snapshot.asOf.toISOString() > updatedAt)) {
      updatedAt = snapshot.asOf.toISOString();
    }
  }

  const { targets, unmapped } = toSyncTargets(instruments);
  const openIds = new Set(
    positions
      .filter((p) => new Decimal(p.quantity).gt(0))
      .map((p) => p.instrumentId),
  );

  return {
    rows,
    sort,
    syncTargets: targets.map(({ id, name }) => ({ id, name })),
    unmapped: splitUnmapped(unmapped, openIds),
    invested: totalInvested(rows),
    value: totalMarketValue(rows),
    unrealized: totalUnrealizedPnL(rows),
    updatedAt,
    noRate: namesOf(unconvertibleInstrumentIds(events), instruments),
    unrated: unratedNames(
      valuation.unrated,
      instruments,
      openIds,
      intlTag(locale),
    ),
  };
}

export default function Portfolio({ loaderData }: Route.ComponentProps) {
  const { formatMoney, formatRelativeTime } = useFormat();
  const t = useCopy();
  const {
    rows,
    sort,
    invested,
    value,
    unrealized,
    updatedAt,
    syncTargets,
    unmapped,
    noRate,
    unrated,
  } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "loading";

  return (
    <>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {rows.length > 0 && (
              <span className="text-[13px] text-muted">
                {t.portfolio.summary(rows.length, formatMoney(invested))}
                {value !== null && (
                  <> · {t.portfolio.value(formatMoney(value))}</>
                )}
              </span>
            )}
            {unrealized !== null && (
              <SignedMoney
                value={unrealized}
                className="text-[13px] font-medium"
              />
            )}
          </div>
          {rows.length > 0 && (
            <p className="mt-1 text-[12px] text-muted">
              {updatedAt
                ? t.portfolio.updatedAt(formatRelativeTime(updatedAt))
                : t.portfolio.noPrices}
            </p>
          )}
        </div>
        {rows.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <SyncPricesButton targets={syncTargets} unmapped={unmapped} />
            <IngestModal />
          </div>
        )}
      </header>

      {noRate.length > 0 && (
        <Explainer tone="notice" className="mb-4">
          {t.common.noRateExcluded(noRate)}
        </Explainer>
      )}
      <UnratedNotice unrated={unrated} className="mb-4" />

      <Card>
        {rows.length === 0 ? (
          <PortfolioEmpty />
        ) : (
          <PortfolioTable rows={rows} sort={sort} busy={busy} />
        )}
      </Card>
    </>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
