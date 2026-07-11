import { useNavigation } from "react-router";

import type { Route } from "./+types/portfolio";

import {
  Card,
  PortfolioEmpty,
  PortfolioError,
  PortfolioTable,
} from "~/components";
import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
} from "~/adapters/persistence";
import { computePositions, computeTradeMeta } from "~/core/projections";
import {
  es,
  parseSort,
  sortPortfolioRows,
  toPortfolioRows,
  totalInvested,
  formatMoney,
} from "~/lib";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Cartera · Quoin" },
    { name: "description", content: "Tus posiciones actuales" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const sort = parseSort(new URL(request.url).searchParams);

  const ledger = new PrismaLedgerRepository();
  const instrumentsRepo = new PrismaInstrumentRepository();
  const [events, instruments] = await Promise.all([
    ledger.list(),
    instrumentsRepo.list(),
  ]);

  const positions = computePositions(events);
  const tradeMeta = computeTradeMeta(events);
  const rows = sortPortfolioRows(
    toPortfolioRows(positions, instruments, tradeMeta),
    sort,
  );

  return { rows, sort, invested: totalInvested(rows) };
}

export default function Portfolio({ loaderData }: Route.ComponentProps) {
  const { rows, sort, invested } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "loading";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight">
          {es.portfolio.title}
        </h1>
        {rows.length > 0 && (
          <span className="text-[13px] text-muted">
            {es.portfolio.summary(rows.length, formatMoney(invested))}
          </span>
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
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <h1 className="mb-4 text-[22px] font-semibold tracking-tight">
        {es.portfolio.title}
      </h1>
      <Card>
        <PortfolioError onRetry={() => window.location.reload()} />
      </Card>
    </main>
  );
}
