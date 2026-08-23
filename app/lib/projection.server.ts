import Decimal from "decimal.js";

import {
  PrismaInflationRepository,
  PrismaInstrumentRepository,
  PrismaLedgerRepository,
  PrismaPriceRepository,
  PrismaTargetRepository,
} from "~/adapters/persistence";
import {
  averageMonthlyInflation,
  BASE_CURRENCY,
  getActiveTarget,
  monthlyTotal,
  type PortfolioTarget,
} from "~/core/domain";
import {
  computeMarketValues,
  computePortfolioSummary,
  computePositions,
  type ProjectionInput,
} from "~/core/projections";

import { heldValuesByInstrument } from "./portfolio";
import { buildProjectionSource, type ProjectionSource } from "./projection";
import { DEFAULT_INFLATION_SERIES } from "./real.server";

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
  nameOf: (instrumentId: string) => string;
}

export interface ProjectionContext {
  annualInflation: string | null;
  plan: ProjectionPlan | null;
}

export async function loadProjectionContext(
  asOf: Date = new Date(),
): Promise<ProjectionContext> {
  const priceRepository = new PrismaPriceRepository();
  const [events, instruments, prices, targets, inflationPoints] =
    await Promise.all([
      new PrismaLedgerRepository().list(),
      new PrismaInstrumentRepository().list(),
      priceRepository.latest(),
      new PrismaTargetRepository().list(),
      new PrismaInflationRepository().list(DEFAULT_INFLATION_SERIES),
    ]);

  const monthlyInflation = averageMonthlyInflation(inflationPoints);
  const annualInflation =
    monthlyInflation === null
      ? null
      : new Decimal(monthlyInflation).plus(1).pow(12).minus(1).toFixed(6);

  const target = getActiveTarget(targets, asOf);
  if (target === null) return { annualInflation, plan: null };

  const positions = computePositions(events);
  const marketValues = computeMarketValues(positions, prices, BASE_CURRENCY);
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
  const histories = await Promise.all(
    historyIds.map((id) => priceRepository.historyFor(id)),
  );

  const source = buildProjectionSource(
    target,
    new Map(
      historyIds.map((id, index) => [
        id,
        (histories[index] ?? [])
          .filter((snapshot) => snapshot.currency === BASE_CURRENCY)
          .map((snapshot) => ({ asOf: snapshot.asOf, price: snapshot.price })),
      ]),
    ),
    instrumentsById,
    offPlanValues,
    asOf,
  );

  return {
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
      nameOf,
    },
  };
}
