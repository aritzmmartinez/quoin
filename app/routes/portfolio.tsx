import { useNavigation } from "react-router";

import type { Route } from "./+types/portfolio";

import {
  Card,
  PortfolioEmpty,
  PortfolioError,
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
  es,
  formatMoney,
  formatRelativeTime,
  parseSort,
  sortPortfolioRows,
  toPortfolioRows,
  totalInvested,
  totalMarketValue,
  totalUnrealizedPnL,
} from "~/lib";


export function meta(_: Route.MetaArgs) {
  return [
    { title: "Cartera · Quoin" },
    { name: "description", content: "Tus posiciones actuales" },
  ];
}

export const handle = { title: es.portfolio.title };

export async function loader({ request }: Route.LoaderArgs) {
  const sort = parseSort(new URL(request.url).searchParams);

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
  );

  // Freshness: newest quote timestamp among held instruments.
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
  const { rows, sort, invested, value, unrealized, updatedAt } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "loading";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {rows.length > 0 && (
            <span className="text-[13px] text-muted">
              {es.portfolio.summary(rows.length, formatMoney(invested))}
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
              ? es.portfolio.updatedAt(formatRelativeTime(updatedAt))
              : es.portfolio.noPrices}
          </p>
        )}
      </header>

      <Card>
        {rows.length === 0 ? (
          <PortfolioEmpty />
        ) : (
          <PortfolioTable rows={rows} sort={sort} busy={busy} />
        )}
      </Card>
    </main>
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
