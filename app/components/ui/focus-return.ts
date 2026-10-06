export interface Focusable {
  focus: () => void;
  isConnected?: boolean;
}

export function asFocusable(element: unknown): Focusable | null {
  if (
    typeof element === "object" &&
    element !== null &&
    "focus" in element &&
    typeof element.focus === "function"
  ) {
    return element as Focusable;
  }
  return null;
}

export function returnFocus(element: Focusable | null): boolean {
  if (!element || element.isConnected === false) return false;
  element.focus();
  return true;
}
