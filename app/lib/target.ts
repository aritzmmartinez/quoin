import {
  deriveTargetWeights,
  monthlyTotal,
  type Instrument,
  type PortfolioTarget,
} from "~/core/domain";

export interface TargetRow {
  instrumentId: string;
  name: string;
  monthlyAmount: string;
  weight: string;
  held: boolean;
  known: boolean;
}

export function toTargetRows(
  target: PortfolioTarget,
  instruments: ReadonlyMap<string, Instrument>,
  heldIds: ReadonlySet<string> = new Set(),
): TargetRow[] {
  return deriveTargetWeights(target).map((allocation) => {
    const instrument = instruments.get(allocation.instrumentId);
    return {
      instrumentId: allocation.instrumentId,
      name: instrument?.name ?? allocation.instrumentId,
      monthlyAmount: allocation.monthlyAmount,
      weight: allocation.weight,
      held: heldIds.has(allocation.instrumentId),
      known: instrument !== undefined,
    };
  });
}

export interface TargetVersionRow {
  id: string;
  name: string;
  activeFrom: string;
  note: string | null;
  monthlyTotal: string;
  lineCount: number;
  isActive: boolean;
}

export function toTargetVersionRows(
  targets: readonly PortfolioTarget[],
  activeId: string | null,
): TargetVersionRow[] {
  return targets
    .map((target) => ({
      id: target.id,
      name: target.name,
      activeFrom: target.activeFrom.toISOString(),
      note: target.note ?? null,
      monthlyTotal: monthlyTotal(target),
      lineCount: target.lines.length,
      isActive: target.id === activeId,
    }))
    .sort((a, b) => b.activeFrom.localeCompare(a.activeFrom));
}
