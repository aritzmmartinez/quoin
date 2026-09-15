import { useNavigation } from "react-router";

import type { Route } from "./+types/portfolio";

import {
  Card,
  IngestModal,
  PortfolioEmpty,
  PortfolioTable,
  SignedMoney,
} from "~/components";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { BASE_CURRENCY } from "~/core/domain";
import {
  computeMarketValues,
  computePositions,
  computeTradeMeta,
} from "~/core/projections";
import {
  type Copy,
  copyFor,
  copyFromMatches,
  parseLocale,
  parseSort,
  sortPortfolioRows,
  toPortfolioRows,
  totalInvested,
  totalMarketValue,
  totalUnrealizedPnL,
  useCopy,
  useFormat,
} from "~/lib";

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

  const [events, instruments, prices] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().latest(),
  ]);

  const positions = computePositions(events);
  const tradeMeta = computeTradeMeta(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);

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

  return {
    rows,
    sort,
    invested: totalInvested(rows),
    value: totalMarketValue(rows),
    unrealized: totalUnrealizedPnL(rows),
    updatedAt,
  };
}

export default function Portfolio({ loaderData }: Route.ComponentProps) {
  const { formatMoney, formatRelativeTime } = useFormat();
  const t = useCopy();
  const { rows, sort, invested, value, unrealized, updatedAt } = loaderData;
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
                {value !== null && <> · {formatMoney(value)} valor</>}
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
        <IngestModal />
      </header>

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
