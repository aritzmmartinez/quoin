import { describe, expect, it } from "vitest";

import { namesAgree, normaliseCompanyName } from "./names";

const same = (a: string, b: string): boolean =>
  normaliseCompanyName(a) === normaliseCompanyName(b);

describe("normaliseCompanyName", () => {
  it("agrees across the ways issuers write one company", () => {
    expect(same("NVIDIA Corp", "NVIDIA CORPORATION")).toBe(true);
    expect(same("Banco Santander SA", "BANCO SANTANDER, S.A.")).toBe(true);
    expect(same("L'Oreal SA", "L'ORÉAL")).toBe(true);
  });

  it("keeps different companies apart", () => {
    expect(same("Merck & Co Inc", "Merck KGaA")).toBe(false);
    expect(same("Banco Santander SA", "Sanofi SA")).toBe(false);
  });

  it("keeps share classes apart when the issuer spells them out", () => {
    expect(same("Alphabet Inc Class A", "Alphabet Inc Class C")).toBe(false);
    expect(
      same("Berkshire Hathaway Inc Class B", "Berkshire Hathaway Inc Class A"),
    ).toBe(false);
  });

  it("collapses them when the issuer does not, which is why the caller refuses", () => {
    expect(same("Alphabet Inc", "Alphabet Inc")).toBe(true);
  });

  it("survives an empty or punctuation-only name", () => {
    expect(normaliseCompanyName("")).toBe("");
    expect(normaliseCompanyName(" .,- ")).toBe("");
  });
});

describe("namesAgree", () => {
  it("accepts a name clipped by one source but not the other", () => {
    expect(
      namesAgree(
        "TAIWAN SEMICONDUCTOR MANUFACT",
        "Taiwan Semiconductor Manufacturing Co Ltd",
      ),
    ).toBe(true);
  });

  it("refuses a short prefix that would swallow an unrelated company", () => {
    expect(namesAgree("Bank", "Bank of America Corp")).toBe(false);
    expect(namesAgree("SAP", "SAP SE")).toBe(true);
  });

  it("still keeps genuinely different companies apart", () => {
    expect(namesAgree("Merck & Co Inc", "Merck KGaA")).toBe(false);
    expect(namesAgree("Banco Santander SA", "Sanofi SA")).toBe(false);
  });

  it("refuses when either side is empty", () => {
    expect(namesAgree("", "NVIDIA Corp")).toBe(false);
    expect(namesAgree("Corp Inc Ltd", "NVIDIA")).toBe(false);
  });
});
