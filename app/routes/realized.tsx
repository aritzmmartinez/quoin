import { useNavigation } from "react-router";

import type { Route } from "./+types/realized";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
} from "~/adapters/persistence";
import {
  BasisNotice,
  Card,
  RealizedTable,
  RealizedViewTabs,
  TaxYearPanel,
  InfoHint,
  signClass,
} from "~/components";
import { computeRealizedGains } from "~/core/projections";
import {
  buildTaxYearView,
  type Copy,
  copyFor,
  copyFromMatches,
  createFormat,
  groupRealizedByYear,
  listTaxYears,
  parseLocale,
  parseRealizedSort,
  parseRealizedView,
  parseTaxYear,
  realizedTotals,
  toRealizedRows,
  useCopy,
  useFormat,
} from "~/lib";
import { resolveRealView } from "~/lib/real.server";

export function meta({ matches }: Route.MetaArgs) {
  const t = copyFromMatches(matches);
  return [
    { title: t.meta.realized.title },
    { name: "description", content: t.meta.realized.description },
  ];
}

export const handle = {
  title: (t: Copy) => t.realized.title,
  basis: true,
  parent: "/",
};

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const view = parseRealizedView(params);
  const sort = parseRealizedSort(params);
  const locale = parseLocale(request.headers.get("Cookie"));
  const tag = createFormat(locale).tag;

  const [events, instruments] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
  ]);

  const real = await resolveRealView(request, events);
  const rows = toRealizedRows(
    computeRealizedGains(events, real.revalue),
    instruments,
  );

  const taxYears = listTaxYears(events);
  const taxYear = parseTaxYear(params, taxYears);

  return {
    view,
    years: groupRealizedByYear(rows, sort, tag),
    totals: realizedTotals(rows),
    sort,
    real: {
      basis: real.basis,
      active: real.active,
      reference: real.reference,
      missing: real.missing,
      hasIndex: real.hasIndex,
      syncedAt: real.syncedAt,
      checkStale: real.checkStale,
    },
    fiscal: {
      years: taxYears,
      year: taxYear,
      view:
        view !== "tax" || taxYear === null
          ? null
          : buildTaxYearView(events, instruments, taxYear, copyFor(locale)),
    },
  };
}

export default function Realized({ loaderData }: Route.ComponentProps) {
  const { formatSignedMoney } = useFormat();
  const t = useCopy();
  const { view, years, totals, sort, real, fiscal } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "loading";

  if (view === "tax") {
    return (
      <>
        <header className="mb-4">
          <RealizedViewTabs value={view} />
        </header>
        <TaxYearPanel
          years={fiscal.years}
          year={fiscal.year}
          view={fiscal.view}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <RealizedViewTabs value={view} />
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          {totals.count > 0 && (
            <>
              <span>
                <span className="font-mono text-text">{totals.count}</span>{" "}
                {t.realized.salesNoun(totals.count)}
              </span>
              <span
                className={`font-mono font-medium ${signClass(totals.realizedPnL)}`}
              >
                {formatSignedMoney(totals.realizedPnL).text}
              </span>
              <span>{t.realized.resultNoun}</span>
            </>
          )}
          <InfoHint
            name={t.realized.about}
            label={
              <>
                <span>{t.realized.intro}</span>
                <span className="text-muted">{t.realized.avcoWarning}</span>
              </>
            }
          />
        </div>
      </header>

      <BasisNotice {...real} />

      <Card>
        {totals.count === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-[15px] font-semibold">
              {t.realized.empty.title}
            </div>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
              {t.realized.empty.body}
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
    </div>
  );
}

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
