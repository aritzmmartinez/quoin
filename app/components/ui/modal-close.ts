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

type PointerTarget = { target: unknown; currentTarget: unknown };

export interface BackdropPress {
  down: boolean;
  up: boolean;
}

export const NO_PRESS: BackdropPress = { down: false, up: false };

function onBackdrop(event: PointerTarget): boolean {
  return event.target === event.currentTarget;
}

export function pressStarted(event: PointerTarget): BackdropPress {
  return { down: onBackdrop(event), up: false };
}

export function pressEnded(
  press: BackdropPress,
  event: PointerTarget,
): BackdropPress {
  return { down: press.down, up: onBackdrop(event) };
}

export function handleBackdropClick(
  event: PointerTarget,
  press: BackdropPress,
  guard: Guard,
  close: () => void,
): void {
  if (!press.down || !press.up || !onBackdrop(event)) return;
  attemptClose(guard, close);
}
