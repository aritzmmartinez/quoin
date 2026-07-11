import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatMoney,
  formatQuantity,
  formatSignedMoney,
} from "./format";

const norm = (s: string) => s.replace(/[\s\u00a0\u202f]/g, " ");

describe("formatMoney", () => {
  it("formats EUR with a comma decimal separator", () => {
    expect(norm(formatMoney("1234.56"))).toContain("1234,56");
  });

  it("groups thousands for 5+ digit integers", () => {
    expect(norm(formatMoney("12345.60"))).toContain("12.345,60");
  });
});

describe("formatQuantity", () => {
  it("shows whole shares without decimals", () => {
    expect(formatQuantity("12")).toBe("12");
  });

  it("preserves crypto precision", () => {
    expect(formatQuantity("0.00412345")).toBe("0,00412345");
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
