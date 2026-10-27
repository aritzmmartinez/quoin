import { describe, expect, it } from "vitest";

import { createFormat } from "./format";

const MADRID = "Europe/Madrid";

const {
  formatAmount,
  formatClock,
  formatDate,
  formatMoney,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatRelativeTime,
  formatSignedMoney,
} = createFormat("es", MADRID);

const norm = (s: string) => s.replace(/[\s\u00a0\u202f]/g, " ");

describe("formatMoney", () => {
  it("formats EUR with a comma decimal separator", () => {
    expect(norm(formatMoney("1234.56"))).toContain("1234,56");
  });

  it("groups thousands for 5+ digit integers", () => {
    expect(norm(formatMoney("12345.60"))).toContain("12.345,60");
  });
});

describe("formatAmount", () => {
  it("formats an amount in another currency with two decimals and its code", () => {
    expect(norm(formatAmount("343.990000", "USD"))).toBe("343,99 USD");
    expect(
      norm(createFormat("en", MADRID).formatAmount("343.990000", "USD")),
    ).toBe("343.99 USD");
  });

  it("formats an amount in euros exactly as formatMoney does", () => {
    expect(formatAmount("1234.5", "EUR")).toBe(formatMoney("1234.5"));
  });
});

describe("formatQuantity", () => {
  it("shows whole shares without decimals", () => {
    expect(formatQuantity("12")).toBe("12");
  });

  it("preserves crypto precision", () => {
    expect(formatQuantity("0.00412345")).toBe("0,00412345");
  });

  it("shows ten decimals of millions of units without losing a digit", () => {
    expect(norm(formatQuantity("12345678.1234567891"))).toBe(
      "12.345.678,1234567891",
    );
  });
});

describe("formatPrice", () => {
  it("formats a price of one or more as money, two decimals", () => {
    expect(formatPrice("769.05")).toBe(formatMoney("769.05"));
    expect(formatPrice("1")).toBe(formatMoney("1"));
    expect(formatPrice("0")).toBe(formatMoney("0"));
  });

  it("formats a price under one to four significant digits, never to zero", () => {
    expect(norm(formatPrice("0.00000438"))).toBe("0,00000438 €");
    expect(norm(formatPrice("0.1234567"))).toBe("0,1235 €");
    expect(norm(formatPrice("0.5"))).toBe("0,50 €");
  });

  it("names another currency after the figure, by the same rule", () => {
    expect(norm(formatPrice("0.00000438", "USD"))).toBe("0,00000438 USD");
    expect(norm(formatPrice("343.99", "USD"))).toBe("343,99 USD");
    expect(
      norm(createFormat("en", MADRID).formatPrice("0.00000438", "USD")),
    ).toBe("0.00000438 USD");
  });
});

describe("formatSignedMoney", () => {
  it("marks gains positive", () => {
    const r = formatSignedMoney("125.40");
    expect(r.sign).toBe("positive");
    expect(r.text.startsWith("+")).toBe(true);
  });

  it("marks losses negative with a typographic minus", () => {
    const r = formatSignedMoney("-40.10");
    expect(r.sign).toBe("negative");
    expect(r.text.startsWith("\u2212")).toBe(true);
  });

  it("treats zero as neutral, unsigned", () => {
    const r = formatSignedMoney("0");
    expect(r.sign).toBe("zero");
    expect(r.text.startsWith("+")).toBe(false);
    expect(r.text.startsWith("\u2212")).toBe(false);
  });
});

describe("formatDate", () => {
  it("renders a short es-ES date", () => {
    const out = norm(formatDate("2026-07-01T10:00:00.000Z")).toLowerCase();
    expect(out).toContain("2026");
    expect(out).toContain("jul");
  });
});

describe("formatPercent", () => {
  it("renders a 0..1 fraction as a percentage with one decimal", () => {
    expect(norm(formatPercent("0.1732"))).toContain("17,3");
    expect(norm(formatPercent("0.1732"))).toContain("%");
  });

  it("signs a deviation on request, and leaves zero unsigned", () => {
    expect(norm(formatPercent("0.0125", 1, { signed: true }))).toContain("+1,3");
    expect(norm(formatPercent("-0.00125", 1, { signed: true }))).toMatch(
      /[-−]0,1/,
    );
    expect(norm(formatPercent("0", 1, { signed: true }))).not.toMatch(/[+-]/);
  });

  it("floors a tiny non-zero weight to '<0,1 %' rather than '0,0 %'", () => {
    const out = norm(formatPercent("0.0001344", 1, { floorNonZero: true }));
    expect(out).toContain("<0,1");
    expect(out).toContain("%");
  });

  it("keeps the floor precision-aware: two decimals floors to '<0,01 %'", () => {
    expect(norm(formatPercent("0.00003", 2, { floorNonZero: true }))).toContain(
      "<0,01",
    );
    const shown = norm(formatPercent("0.000134", 2, { floorNonZero: true }));
    expect(shown).toContain("0,01");
    expect(shown).not.toContain("<");
  });

  it("does not floor an exact zero, even with the option on", () => {
    expect(norm(formatPercent("0", 1, { floorNonZero: true }))).not.toContain(
      "<",
    );
  });

  it("does not floor a value that rounds to a visible figure", () => {
    expect(
      norm(formatPercent("0.006", 1, { floorNonZero: true })),
    ).not.toContain("<");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-12T12:00:00.000Z");
  it("uses minutes for recent times", () => {
    const out = formatRelativeTime("2026-07-12T11:55:00.000Z", now);
    expect(out).toContain("minuto");
  });
  it("uses days for older times", () => {
    const out = formatRelativeTime("2026-07-07T12:00:00.000Z", now);
    expect(out.toLowerCase()).toContain("días");
  });
});

describe("formatClock", () => {
  it("reads the clock in Madrid, not UTC, across the DST switch", () => {
    expect(norm(formatClock(new Date("2026-07-01T12:32:00.000Z")))).toBe(
      "14:32",
    );
    expect(norm(formatClock(new Date("2026-01-15T12:32:00.000Z")))).toBe(
      "13:32",
    );
  });
});
