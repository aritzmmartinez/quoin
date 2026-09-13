import type { Route } from "./+types/ter";

import {
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
} from "~/adapters/persistence";
import {
  Card,
  Explainer,
  InfoHint,
  StatTile,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_ROW,
  TABLE_SCROLL,
} from "~/components";
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

export const handle = { title: es.ter.title, parent: "/" };

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
      <header className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span>
          <span className="font-mono text-text">
            {formatMoney(weighted.coveredValue)}
          </span>{" "}
          {t.coverageOf}{" "}
          <span className="font-mono">{formatMoney(weighted.totalValue)}</span>{" "}
          {t.coverageSuffix}
        </span>
        <span className="rounded border border-border px-1.5 py-1 font-mono text-[11px] font-medium leading-none">
          {formatPercent(weighted.coverage)}
        </span>
        <InfoHint name={t.about} label={t.intro} />
      </header>

      <div
        className="mb-3 grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
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

      {unknown.length > 0 && (
        <Explainer tone="notice" className="mt-2">
          {t.unknown(unknown.join(", "))}
        </Explainer>
      )}

      <Card className="mt-4 flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[14px] font-semibold">
              {t.projected.title(horizonYears)}
            </h2>
            <InfoHint
              size={18}
              name={t.projected.noteTitle}
              label={t.projected.note}
            />
          </div>
          <p className="text-[12px] leading-snug text-muted">
            {t.projected.horizonPre(horizonYears)}{" "}
            <span className="font-mono">{formatMoney(contribution)}</span>{" "}
            {t.projected.horizonPost}
          </p>
        </div>

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
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            <StatTile
              tone="inset"
              subClass="font-mono text-faint"
              label={t.projected.p10.label}
              sub={t.projected.p10.sub}
              value={formatMoney(projected.p10)}
            />
            <StatTile
              tone="inset"
              subClass="font-mono text-faint"
              label={t.projected.p50.label}
              sub={t.projected.p50.sub}
              value={formatMoney(projected.p50)}
            />
            <StatTile
              tone="inset"
              subClass="font-mono text-faint"
              label={t.projected.p90.label}
              sub={t.projected.p90.sub}
              value={formatMoney(projected.p90)}
            />
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-gutter py-4">
          <h2 className="text-[14px] font-semibold">{t.table.title}</h2>
          <span className="text-[12px] text-muted">{t.table.only}</span>
        </div>
        <div className={TABLE_SCROLL}>
          <div className="min-w-140">
            <div className={`${TABLE_HEAD} ${GRID}`}>
              <span>{t.table.instrument}</span>
              <span className="text-right">{t.table.value}</span>
              <span className="text-right">{t.table.ter}</span>
              <span className="text-right">{t.table.annualCost}</span>
            </div>
            <ul>
              {rows.map((row) => (
                <li
                  key={row.instrumentId}
                  className={`${TABLE_ROW} ${GRID} min-h-11 text-[13px]`}
                >
                  <span className="truncate font-medium">{row.name}</span>
                  <span className={`${TABLE_NUM} text-right`}>
                    {formatMoney(row.value)}
                  </span>
                  <span
                    className={`${TABLE_NUM} text-right font-normal text-muted`}
                  >
                    {row.ter === null ? DASH : formatPercent(row.ter, 2)}
                  </span>
                  <span className={`${TABLE_NUM} text-right`}>
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

export { ErrorBoundary } from "~/components/ui/ErrorBoundary";
