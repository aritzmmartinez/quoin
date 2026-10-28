import Decimal from "decimal.js";

import {
  PrismaInflationRepository,
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  PrismaTargetRepository,
} from "~/adapters/persistence";
import { today } from "~/core/calendar";
import {
  averageMonthlyInflation,
  BASE_CURRENCY,
  getActiveTarget,
  monthlyTotal,
  type PortfolioTarget,
} from "~/core/domain";
import { historyInBase } from "~/core/fx";
import {
  computeMarketValues,
  computePortfolioSummary,
  computePositions,
  type ProjectionInput,
} from "~/core/projections";

import { heldValuesByInstrument } from "./portfolio";
import { buildProjectionSource, type ProjectionSource } from "./projection";
import { loadValuation } from "./rate-book.server";
import { DEFAULT_INFLATION_SERIES } from "./real.server";
import { loadResidence } from "./residence.server";
import { unratedNames, type UnratedNames } from "./unrated";
import { createServerTiming, type ServerTiming } from "./server-timing";

export type ProjectionCase = Omit<
  ProjectionInput,
  "horizonMonths" | "monthlyContribution"
>;

export interface ProjectionPlan {
  target: PortfolioTarget;
  source: ProjectionSource;
  input: ProjectionCase;
  defaultContribution: string;
  offPlanValues: Map<string, string>;
  unpricedCount: number;
  unrated: UnratedNames | null;
  nameOf: (instrumentId: string) => string;
}

export interface ProjectionContext {
  hasTrades: boolean;
  annualInflation: string | null;
  plan: ProjectionPlan | null;
}

export async function loadProjectionContext(
  asOf: Date = new Date(),
  timing: ServerTiming = createServerTiming(),
): Promise<ProjectionContext> {
  const priceRepository = new PrismaPriceRepository();
  const { jurisdiction, calendarZone } = await timing.time("db-settings", () =>
    loadResidence(),
  );
  const events = await timing.time("db-ledger", () =>
    new PrismaLedgerRepository().list(),
  );
  const instruments = await timing.time("db-instruments", () =>
    new PrismaInstrumentRepository().list(),
  );
  const valuation = await timing.time("db-prices-latest", () =>
    loadValuation(calendarZone, asOf),
  );
  const targets = await timing.time("db-targets", () =>
    new PrismaTargetRepository().list(),
  );
  const inflationPoints = await timing.time("db-inflation", () =>
    new PrismaInflationRepository().list(DEFAULT_INFLATION_SERIES),
  );

  const monthlyInflation = averageMonthlyInflation(inflationPoints);
  const annualInflation =
    monthlyInflation === null
      ? null
      : new Decimal(monthlyInflation).plus(1).pow(12).minus(1).toFixed(6);

  const target = getActiveTarget(targets, today(calendarZone, asOf));
  const hasTrades = events.length > 0;
  if (target === null) return { hasTrades, annualInflation, plan: null };

  const positions = timing.time("positions", () =>
    computePositions(events, jurisdiction),
  );
  const marketValues = timing.time("valuation", () =>
    computeMarketValues(positions, valuation.prices, BASE_CURRENCY),
  );
  const summary = computePortfolioSummary(positions, marketValues);
  const held = heldValuesByInstrument(positions, marketValues);

  const instrumentsById = new Map(
    instruments.map((instrument) => [instrument.id, instrument]),
  );
  const nameOf = (id: string): string => instrumentsById.get(id)?.name ?? id;

  const plannedIds = new Set(target.lines.map((line) => line.instrumentId));

  let plannedValue = new Decimal(0);
  const offPlanValues = new Map<string, string>();
  for (const [instrumentId, entry] of held) {
    if (plannedIds.has(instrumentId))
      plannedValue = plannedValue.plus(entry.value);
    else if (entry.value.gt(0)) {
      offPlanValues.set(instrumentId, entry.value.toFixed(2));
    }
  }

  const historyIds = [...new Set([...plannedIds, ...offPlanValues.keys()])];
  const histories = await timing.time("db-history", () =>
    Promise.all(historyIds.map((id) => priceRepository.historyFor(id))),
  );

  const source = timing.time("projection-source", () =>
    buildProjectionSource(
      target,
      new Map(
        historyIds.map((id, index) => [
          id,
          historyInBase(
            histories[index] ?? [],
            valuation.book,
            calendarZone,
          ).history.map((snapshot) => ({
            asOf: snapshot.asOf,
            price: snapshot.price,
          })),
        ]),
      ),
      instrumentsById,
      offPlanValues,
      asOf,
      calendarZone,
    ),
  );

  return {
    hasTrades,
    annualInflation,
    plan: {
      target,
      source,
      input: {
        lines: source.lines,
        heldLines: source.heldLines,
        plannedValue: plannedValue.toFixed(2),
        monthlyInflation,
      },
      defaultContribution: monthlyTotal(target),
      offPlanValues,
      unpricedCount: summary.unpricedCount,
      unrated: unratedNames(valuation.unrated, instruments, held.keys()),
      nameOf,
    },
  };
}
