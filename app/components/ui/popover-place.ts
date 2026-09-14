export interface Box {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface PlaceInput {
  anchor: Box;
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  align?: "center" | "start" | "end";
  margin?: number;
}

export function placePopover({
  anchor,
  panel,
  viewport,
  align = "center",
  margin = 8,
}: PlaceInput): { left: number; top: number } {
  const below = anchor.bottom + margin;
  const above = anchor.top - panel.height - margin;
  const top =
    below + panel.height > viewport.height && above >= margin ? above : below;

  const unclampedLeft =
    align === "start"
      ? anchor.left
      : align === "end"
        ? anchor.left + anchor.width - panel.width
        : anchor.left + anchor.width / 2 - panel.width / 2;

  return {
    left: clamp(unclampedLeft, margin, viewport.width - panel.width - margin),
    top: clamp(top, margin, viewport.height - panel.height - margin),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
