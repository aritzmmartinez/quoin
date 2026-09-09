export type CloseIntent = "allow" | "block" | "confirm";

export function ingestCloseIntent(state: {
  inFlight: boolean;
  imported: boolean;
  atDone: boolean;
}): CloseIntent {
  if (state.inFlight) return "block";
  if (state.imported && !state.atDone) return "confirm";
  return "allow";
}

export function resolveClose(
  intent: CloseIntent,
  onConfirm: () => void,
): boolean {
  if (intent === "block") return false;
  if (intent === "confirm") {
    onConfirm();
    return false;
  }
  return true;
}

export function shouldBounceForcedClose(inFlight: boolean): boolean {
  return inFlight;
}
