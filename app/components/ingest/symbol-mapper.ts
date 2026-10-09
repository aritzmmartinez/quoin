import type { SymbolCheck } from "~/lib/symbol-check";

export interface MapperState {
  symbol: string;
  check: SymbolCheck | null;
  error: string | null;
  busy: "check" | "save" | null;
}

export type MapperEvent =
  | { type: "edit"; symbol: string }
  | { type: "verify" }
  | { type: "verified"; check: SymbolCheck }
  | { type: "save" }
  | { type: "saved" }
  | { type: "failed"; error: string };

export function initialMapper(symbol: string): MapperState {
  return { symbol, check: null, error: null, busy: null };
}

export function mapperReducer(
  state: MapperState,
  event: MapperEvent,
): MapperState {
  switch (event.type) {
    case "edit":
      return { ...state, symbol: event.symbol, check: null, error: null };
    case "verify":
      return { ...state, busy: "check", error: null };
    case "verified":
      return { ...state, busy: null, check: event.check };
    case "save":
      return { ...state, busy: "save", error: null };
    case "saved":
      return { ...state, busy: null };
    case "failed":
      return {
        ...state,
        busy: null,
        error: event.error,
        check: state.busy === "check" ? null : state.check,
      };
  }
}

export function trimmedSymbol(state: MapperState): string {
  return state.symbol.trim();
}

export function isVerified(state: MapperState): boolean {
  return state.check !== null && state.check.symbol === trimmedSymbol(state);
}

export function canVerify(state: MapperState): boolean {
  return trimmedSymbol(state) !== "" && state.busy === null;
}

export function canSave(state: MapperState, stored: string | null): boolean {
  return (
    isVerified(state) &&
    state.check?.foreignCurrency === null &&
    state.busy === null &&
    trimmedSymbol(state) !== stored
  );
}

export function canRedownload(
  state: MapperState,
  stored: string | null,
): boolean {
  return (
    stored !== null && state.busy === null && trimmedSymbol(state) === stored
  );
}

export function checkRequest(
  instrumentId: string,
  state: MapperState,
): Record<string, string> {
  return { intent: "check", instrumentId, symbol: trimmedSymbol(state) };
}
