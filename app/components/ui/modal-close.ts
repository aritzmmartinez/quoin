type Guard = (() => boolean) | undefined;

export function attemptClose(guard: Guard, close: () => void): void {
  if (guard && !guard()) return;
  close();
}

export function handleDialogCancel(
  event: { preventDefault: () => void },
  guard: Guard,
  close: () => void,
): void {
  event.preventDefault();
  attemptClose(guard, close);
}

export function handleBackdropClick(
  event: { target: unknown; currentTarget: unknown },
  guard: Guard,
  close: () => void,
): void {
  if (event.target !== event.currentTarget) return;
  attemptClose(guard, close);
}
