import { useNavigation } from "react-router";

import type { Route } from "./+types/realized";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
} from "~/adapters/persistence";
import { BasisNotice, Card, PortfolioError, RealizedTable } from "~/components";
import { computeRealizedGains } from "~/core/projections";
import {
  es,
  formatSignedMoney,
  groupRealizedByYear,
  parseRealizedSort,
  realizedTotals,
  toRealizedRows,
} from "~/lib";
import { resolveRealView } from "~/lib/real.server";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Realizado · Quoin" },
    { name: "description", content: "Resultado de tus ventas cerradas" },
  ];
}

export const handle = { title: es.realized.title, basis: true };

export async function loader({ request }: Route.LoaderArgs) {
  const sort = parseRealizedSort(new URL(request.url).searchParams);

  const [events, instruments] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
  ]);

  const real = await resolveRealView(request, events);
  const rows = toRealizedRows(
    computeRealizedGains(events, real.revalue),
    instruments,
  );

  return {
    years: groupRealizedByYear(rows, sort),
    totals: realizedTotals(rows),
    sort,
    real: {
      basis: real.basis,
      active: real.active,
      reference: real.reference,
      missing: real.missing,
      hasIndex: real.hasIndex,
    },
  };
}

export default function Realized({ loaderData }: Route.ComponentProps) {
  const { years, totals, sort, real } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "loading";

  return (
    <>
      <header className="mb-4">
        {totals.count > 0 && (
          <span className="text-[13px] text-muted">
            {es.realized.summary(
              totals.count,
              formatSignedMoney(totals.realizedPnL).text,
            )}
          </span>
        )}
        <p className="mt-1 max-w-3xl text-[12px] text-muted">
          {es.realized.intro}
        </p>
        <p className="mt-2 max-w-3xl rounded-card border border-border bg-surface-2 px-3 py-2 text-[12px] text-muted">
          {es.realized.avcoWarning}
        </p>
      </header>

      <BasisNotice {...real} />

      <Card>
        {totals.count === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-[15px] font-semibold">
              {es.realized.empty.title}
            </div>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
              {es.realized.empty.body}
            </p>
          </div>
        ) : (
          <RealizedTable
            years={years}
            totals={totals}
            sort={sort}
            busy={busy}
          />
        )}
      </Card>
    </>
  );
}

export function ErrorBoundary() {
  return (
    <>
      <Card>
        <PortfolioError onRetry={() => window.location.reload()} />
      </Card>
    </>
  );
}
