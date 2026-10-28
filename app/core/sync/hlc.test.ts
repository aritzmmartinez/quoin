import { describe, expect, it } from "vitest";

import { InvalidHlcError, formatHlc, originOf, parseHlc, tick } from "./hlc";

const DEVICE = "3f2a9c1e-0b7d-4e21-9a55-6c0d8e7f1a2b";
const T = Date.UTC(2026, 9, 28, 9, 15);

describe("HLC marks", () => {
  it("round-trips through its text form, which sorts as time does", () => {
    const mark = formatHlc({ ms: T, counter: 7, deviceId: DEVICE });

    expect(mark).toBe(`00${T}-0007-${DEVICE}`);
    expect(parseHlc(mark)).toEqual({ ms: T, counter: 7, deviceId: DEVICE });
    expect(originOf(mark)).toBe(DEVICE);
    expect(formatHlc({ ms: 999, counter: 0, deviceId: DEVICE }) < mark).toBe(true);
  });

  it("refuses a value that is not a mark", () => {
    expect(() => parseHlc("2026-10-28T09:15:00Z")).toThrow(InvalidHlcError);
    expect(() => parseHlc(`${T}-0000-${DEVICE}`)).toThrow(InvalidHlcError);
  });

  it("takes the physical clock when it is ahead", () => {
    expect(tick(null, T, DEVICE)).toBe(formatHlc({ ms: T, counter: 0, deviceId: DEVICE }));
    const last = formatHlc({ ms: T - 1, counter: 3, deviceId: DEVICE });
    expect(tick(last, T, DEVICE)).toBe(formatHlc({ ms: T, counter: 0, deviceId: DEVICE }));
  });

  it("never goes back when the clock does, or stands still", () => {
    const last = formatHlc({ ms: T, counter: 3, deviceId: DEVICE });

    const same = tick(last, T, DEVICE);
    const behind = tick(same, T - 10 * 60_000, DEVICE);

    expect(same).toBe(formatHlc({ ms: T, counter: 4, deviceId: DEVICE }));
    expect(behind).toBe(formatHlc({ ms: T, counter: 5, deviceId: DEVICE }));
    expect(behind > same && same > last).toBe(true);
  });

  it("moves to the next millisecond when the counter is spent", () => {
    const last = formatHlc({ ms: T, counter: 9999, deviceId: DEVICE });
    const next = tick(last, T, DEVICE);

    expect(next).toBe(formatHlc({ ms: T + 1, counter: 0, deviceId: DEVICE }));
    expect(next > last).toBe(true);
  });
});
