export type CloseIntent = "allow" | "block" | "confirm" | "keep";

export interface IngestCloseState {
  inFlight: boolean;
  imported: boolean;
  atDone: boolean;
  confirming: boolean;
}

export function ingestCloseIntent(state: IngestCloseState): CloseIntent {
  if (state.inFlight) return "block";
  if (state.confirming) return "keep";
  if (state.imported && !state.atDone) return "confirm";
  return "allow";
}

export function resolveClose(
  intent: CloseIntent,
  on: { confirm: () => void; keep: () => void },
): boolean {
  if (intent === "block") return false;
  if (intent === "confirm") {
    on.confirm();
    return false;
  }
  if (intent === "keep") {
    on.keep();
    return false;
  }
  return true;
}

export function shouldBounceForcedClose(state: {
  inFlight: boolean;
  imported: boolean;
  atDone: boolean;
  closeConfirmed: boolean;
}): boolean {
  const intent = ingestCloseIntent({ ...state, confirming: false });
  if (intent === "block") return true;
  return intent === "confirm" && !state.closeConfirmed;
}

export function focusAfterBounce<T>(
  confirming: boolean,
  keepButton: T | null,
  returnTo: T | null,
): T | null {
  return confirming ? keepButton : returnTo;
}
