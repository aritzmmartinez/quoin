import { describe, expect, it } from "vitest";

import { placePopover, type Box } from "./popover-place";

const viewport = { width: 1000, height: 600 };
const panel = { width: 200, height: 100 };

function anchor(partial: Partial<Box> = {}): Box {
  return { top: 200, bottom: 232, left: 400, width: 120, ...partial };
}

describe("placePopover", () => {
  it("sits below the anchor with the margin between them", () => {
    expect(placePopover({ anchor: anchor(), panel, viewport }).top).toBe(240);
  });

  it("centres on the anchor by default", () => {
    expect(placePopover({ anchor: anchor(), panel, viewport }).left).toBe(360);
  });

  it("aligns to the anchor's own edges", () => {
    const start = placePopover({
      anchor: anchor(),
      panel,
      viewport,
      align: "start",
    });
    const end = placePopover({
      anchor: anchor(),
      panel,
      viewport,
      align: "end",
    });
    expect(start.left).toBe(400);
    expect(end.left).toBe(320);
  });

  it("flips above when the panel does not fit below", () => {
    const box = anchor({ top: 520, bottom: 552 });
    expect(placePopover({ anchor: box, panel, viewport }).top).toBe(412);
  });

  it("stays below when there is room for neither, and clamps", () => {
    const box = anchor({ top: 40, bottom: 560 });
    expect(placePopover({ anchor: box, panel, viewport }).top).toBe(492);
  });

  it("keeps the panel inside the viewport horizontally", () => {
    const right = placePopover({
      anchor: anchor({ left: 960 }),
      panel,
      viewport,
    });
    const left = placePopover({
      anchor: anchor({ left: -40 }),
      panel,
      viewport,
    });
    expect(right.left).toBe(792);
    expect(left.left).toBe(8);
  });

  it("pins a panel larger than the viewport to the margin", () => {
    const huge = { width: 2000, height: 2000 };
    expect(placePopover({ anchor: anchor(), panel: huge, viewport })).toEqual({
      left: 8,
      top: 8,
    });
  });
});
