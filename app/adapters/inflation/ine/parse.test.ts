import { describe, expect, it } from "vitest";

import { deriveBaseYear, parseIneSeries } from "./parse";

const datum = (
  Anyo: number,
  FK_Periodo: number,
  Valor: number,
  extra: Record<string, unknown> = {},
) => ({ Fecha: 0, FK_TipoDato: 1, Anyo, FK_Periodo, Valor, ...extra });

describe("parseIneSeries", () => {
  it("reads the month from Anyo + FK_Periodo", () => {
    const points = parseIneSeries({
      COD: "IPCTEST",
      Data: [datum(2026, 4, 102.883), datum(2026, 7, 103.899)],
    });

    expect(points).toEqual([
      { period: "2026-04", indexValue: "102.883" },
      { period: "2026-07", indexValue: "103.899" },
    ]);
  });

  it("ignores Fecha, which lands in the previous month when read as UTC", () => {
    const summer = 1774994400000; // 2026-04-01 00:00 CEST = 2026-03-31T22:00Z
    const winter = 1767222000000; // 2026-01-01 00:00 CET  = 2025-12-31T23:00Z

    expect(new Date(summer).toISOString().slice(0, 7)).toBe("2026-03");
    expect(new Date(winter).toISOString().slice(0, 7)).toBe("2025-12");

    const points = parseIneSeries({
      Data: [
        datum(2026, 4, 102.883, { Fecha: summer }),
        datum(2026, 1, 100.836, { Fecha: winter }),
      ],
    });

    expect(points.map((p) => p.period)).toEqual(["2026-01", "2026-04"]);
  });

  it("pins the level to a fixed-point string, so no float crosses the boundary", () => {
    const points = parseIneSeries({ Data: [datum(2026, 6, 103.6)] });
    expect(points[0]!.indexValue).toBe("103.600");
    expect(typeof points[0]!.indexValue).toBe("string");
  });

  it("sorts chronologically whatever order the payload arrives in", () => {
    const points = parseIneSeries({
      Data: [datum(2026, 1, 100), datum(2025, 12, 99), datum(2026, 2, 101)],
    });
    expect(points.map((p) => p.period)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("drops rows that are not a usable monthly level", () => {
    const points = parseIneSeries({
      Data: [
        datum(2026, 1, 100),
        datum(2026, 13, 100), // annual aggregate, not a month
        datum(2026, 0, 100),
        { ...datum(2026, 2, 100), Valor: null },
        { ...datum(2026, 3, 100), Secreto: true },
        { ...datum(2026, 4, 100), Anyo: undefined },
      ],
    });
    expect(points.map((p) => p.period)).toEqual(["2026-01"]);
  });

  it("returns nothing for a payload with no data, rather than throwing", () => {
    expect(parseIneSeries({ Data: [] })).toEqual([]);
    expect(parseIneSeries({ Data: null })).toEqual([]);
    expect(parseIneSeries({})).toEqual([]);
    expect(parseIneSeries(null)).toEqual([]);
  });
});

function year(y: number, levels: number[]) {
  return levels.map((value, i) => ({
    period: `${y}-${String(i + 1).padStart(2, "0")}`,
    indexValue: value.toFixed(3),
  }));
}

const flat = (value: number) => Array.from({ length: 12 }, () => value);

describe("deriveBaseYear", () => {
  it("finds the year whose twelve months average 100", () => {
    const points = [
      ...year(2024, flat(97.5)),
      ...year(
        2025,
        [
          98.5, 99.0, 99.4, 99.7, 99.9, 100.0, 100.0, 100.1, 100.3, 100.6,
          101.0, 101.5,
        ],
      ),
      ...year(2026, flat(103)),
    ];
    expect(deriveBaseYear(points)).toBe("2025");
  });

  it("ignores an incomplete year, even one sitting at 100", () => {
    const points = [
      ...year(2025, flat(100)).slice(0, 6),
      ...year(2026, flat(103)),
    ];
    expect(deriveBaseYear(points)).toBeNull();
  });

  it("refuses when no year averages 100", () => {
    expect(
      deriveBaseYear([...year(2025, flat(97)), ...year(2026, flat(103))]),
    ).toBeNull();
  });

  it("refuses when two years both average 100", () => {
    expect(
      deriveBaseYear([...year(2025, flat(100)), ...year(2026, flat(100))]),
    ).toBeNull();
  });
});
