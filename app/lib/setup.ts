export type SetupStepId = "trades" | "prices" | "target" | "funds";

export interface SetupStep {
  id: SetupStepId;
  done: boolean;
  progress: { have: number; need: number } | null;
}

export const MIN_OVERLAP_FUNDS = 2;

export function tradesStep(hasTrades: boolean): SetupStep {
  return { id: "trades", done: hasTrades, progress: null };
}

export function pricesStep(hasPricedPositions: boolean): SetupStep {
  return { id: "prices", done: hasPricedPositions, progress: null };
}

export function targetStep(hasActiveTarget: boolean): SetupStep {
  return { id: "target", done: hasActiveTarget, progress: null };
}

export function fundsStep(fundsWithHoldings: number): SetupStep {
  return {
    id: "funds",
    done: fundsWithHoldings >= MIN_OVERLAP_FUNDS,
    progress: {
      have: Math.min(fundsWithHoldings, MIN_OVERLAP_FUNDS),
      need: MIN_OVERLAP_FUNDS,
    },
  };
}

export function setupPending(steps: readonly SetupStep[]): boolean {
  return steps.some((step) => !step.done);
}
