import type { Route } from "./+types/ter";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import { Card, Explainer, PortfolioError, StatTile } from "~/components";
import { BASE_CURRENCY } from "~/core/domain";
import {
  computeMarketValues,
  computePositions,
  computeProjection,
  computeWeightedTer,
  projectionWindow,
  type TerLine,
} from "~/core/projections";
import {
  DASH,
  es,
  formatMoney,
  formatPercent,
  heldValuesByInstrument,
  MIN_WINDOW_MONTHS,
  namesOf,
  parseHorizonYears,
  toTerRows,
} from "~/lib";
import { loadProjectionContext } from "~/lib/projection.server";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Coste del TER · Quoin" },
    { name: "description", content: "Lo que cuesta la gestión de tus fondos" },
  ];
}

export const handle = { title: es.ter.title };

type Unavailable = "no-target" | "no-history" | "no-window" | "thin-window";

export async function loader({ request }: Route.LoaderArgs) {
  const horizonYears = parseHorizonYears(new URL(request.url).searchParams);

  const [events, instruments, prices] = await Promise.all([
    new PrismaLedgerRepository().list(),
    new PrismaInstrumentRepository().list(),
    new PrismaPriceRepository().latest(),
  ]);

  const positions = computePositions(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);
  const byId = new Map(instruments.map((i) => [i.id, i]));

  const lines: TerLine[] = [
    ...heldValuesByInstrument(positions, marketValues),
  ].map(([instrumentId, held]) => ({
    instrumentId,
    value: held.value.toFixed(2),
    ter: byId.get(instrumentId)?.ter ?? null,
  }));

  const weighted = computeWeightedTer(lines);

  const empty = {
    horizonYears,
    weighted,
    rows: toTerRows(lines, instruments),
    unknown: namesOf(weighted.unknownInstrumentIds, instruments),
    projected: null,
    contribution: "0.00",
    unavailable: null as Unavailable | null,
    limitingName: "",
    windowMonths: 0,
  };

  const { plan } = await loadProjectionContext();
  if (plan === null) return { ...empty, unavailable: "no-target" as const };
  if (plan.source.lines.length === 0) {
    return { ...empty, unavailable: "no-history" as const };
  }

  const window = projectionWindow(plan.source.lines);
  const located = {
    ...empty,
    contribution: plan.defaultContribution,
    windowMonths: window.windowMonths,
    limitingName: plan.nameOf(window.limitingInstrumentId),
  };
  if (window.windowMonths === 0) {
    return { ...located, unavailable: "no-window" as const };
  }
  if (window.windowMonths < MIN_WINDOW_MONTHS) {
    return { ...located, unavailable: "thin-window" as const };
  }

  const result = computeProjection({
    ...plan.input,
    horizonMonths: horizonYears * 12,
    monthlyContribution: plan.defaultContribution,
    terCost: true,
  });

  return { ...located, projected: result.terCost };
}

const GRID = "grid-cols-[minmax(0,2fr)_120px_100px_140px]";

export default function Ter({ loaderData }: Route.ComponentProps) {
  const t = es.ter;
  const {
    horizonYears,
    weighted,
    rows,
    unknown,
    projected,
    contribution,
    unavailable,
    limitingName,
    windowMonths,
  } = loaderData;

  if (rows.length === 0 || weighted.coveredValue === "0") {
    return (
      <Card>
        <div className="px-6 py-16 text-center">
          <div className="text-[15px] font-semibold">{t.none.title}</div>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">
            {t.none.body}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <header className="mb-4">
        <Explainer>{t.intro}</Explainer>
      </header>

      <div
        className="mb-3 grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
      >
        <StatTile
          label={t.weighted.label}
          sub={t.weighted.sub(formatPercent(weighted.coverage))}
          value={formatPercent(weighted.weightedTer, 2)}
        />
        <StatTile
          label={t.annual.label}
          sub={t.annual.sub}
          value={formatMoney(weighted.annualCost)}
        />
      </div>

      <p className="text-[11px] text-muted">
        {t.coverage(
          formatMoney(weighted.coveredValue),
          formatMoney(weighted.totalValue),
        )}
      </p>
      {unknown.length > 0 && (
        <Explainer tone="notice" className="mt-2">
          {t.unknown(unknown.join(", "))}
        </Explainer>
      )}

      <Card className="mt-4">
        <div className="border-b border-border px-gutter py-3">
          <h2 className="text-[14px] font-semibold">
            {t.projected.title(horizonYears)}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted">
            {t.projected.horizon(horizonYears, formatMoney(contribution))}
          </p>
        </div>

        <div className="px-gutter py-4">
          {projected === null ? (
            <p className="text-[12px] text-muted">
              {unavailable === "thin-window"
                ? t.unavailable["thin-window"](windowMonths, limitingName)
                : unavailable === "no-window" || unavailable === "no-history"
                  ? t.unavailable["no-window"]
                  : t.unavailable["no-target"]}
            </p>
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              }}
            >
              <StatTile
                label={t.projected.p10.label}
                sub={t.projected.p10.sub}
                value={formatMoney(projected.p10)}
              />
              <StatTile
                label={t.projected.p50.label}
                sub={t.projected.p50.sub}
                value={formatMoney(projected.p50)}
              />
              <StatTile
                label={t.projected.p90.label}
                sub={t.projected.p90.sub}
                value={formatMoney(projected.p90)}
              />
            </div>
          )}
        </div>
      </Card>

      <Explainer tone="footnote" className="mt-2">
        {t.projected.note}
      </Explainer>

      <Card className="mt-4">
        <div className="border-b border-border px-gutter py-3">
          <h2 className="text-[14px] font-semibold">{t.table.title}</h2>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-140">
            <div
              className={`grid ${GRID} gap-2 border-b border-border px-gutter py-row text-[11px] font-medium tracking-wide text-muted`}
            >
              <span>{t.table.instrument}</span>
              <span className="text-right">{t.table.value}</span>
              <span className="text-right">{t.table.ter}</span>
              <span className="text-right">{t.table.annualCost}</span>
            </div>
            <ul>
              {rows.map((row) => (
                <li
                  key={row.instrumentId}
                  className={`grid ${GRID} gap-2 border-b border-border px-gutter py-row text-[13px] last:border-b-0`}
                >
                  <span className="truncate">{row.name}</span>
                  <span className="text-right tabular-nums">
                    {formatMoney(row.value)}
                  </span>
                  <span className="text-right tabular-nums text-muted">
                    {row.ter === null ? DASH : formatPercent(row.ter, 2)}
                  </span>
                  <span className="text-right tabular-nums">
                    {row.annualCost === null ? (
                      <span className="text-muted">{t.table.unknown}</span>
                    ) : (
                      formatMoney(row.annualCost)
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </>
  );
}

export function ErrorBoundary() {
  return (
    <Card>
      <PortfolioError onRetry={() => window.location.reload()} />
    </Card>
  );
}
