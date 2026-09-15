import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  intlTag,
  LOCALE_COOKIE,
  LOCALE_KEYS,
  parseLocale,
} from "../locale";

import { copyFor, copyFromMatches, en, es, exposureKindLabel } from "./index";

describe("parseLocale", () => {
  it("reads the locale cookie", () => {
    expect(parseLocale(`${LOCALE_COOKIE}=en`)).toBe("en");
    expect(parseLocale(`${LOCALE_COOKIE}=es`)).toBe("es");
  });

  it("falls back to Spanish for anything it does not recognise", () => {
    expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
    expect(parseLocale("")).toBe(DEFAULT_LOCALE);
    expect(parseLocale(`${LOCALE_COOKIE}=fr`)).toBe(DEFAULT_LOCALE);
    expect(parseLocale("quoin-theme=light")).toBe(DEFAULT_LOCALE);
  });

  it("is not confused by another cookie ending in the same name", () => {
    expect(parseLocale(`quoin-theme=dark; ${LOCALE_COOKIE}=en`)).toBe("en");
  });
});

describe("copyFromMatches", () => {
  it("reads the locale from the root match's loaderData", () => {
    const matches = [
      { loaderData: { theme: "dark", locale: "en" } },
      { loaderData: { version: "0.9.0" } },
    ];
    expect(copyFromMatches(matches).portfolio.title).toBe(en.portfolio.title);
  });

  it("falls back to Spanish when no match carries a locale", () => {
    expect(
      copyFromMatches([{ loaderData: {} }, undefined]).portfolio.title,
    ).toBe(es.portfolio.title);
  });
});

describe("copyFor", () => {
  it("returns a different language per locale", () => {
    expect(copyFor("es").nav.portfolio).toBe("Cartera");
    expect(copyFor("en").nav.portfolio).toBe("Portfolio");
  });
});

describe("intlTag", () => {
  it("maps every locale to a formatting tag", () => {
    for (const locale of LOCALE_KEYS) {
      expect(intlTag(locale)).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });
});

describe("locale parity", () => {
  it("gives every weekday array the same length", () => {
    expect(en.datePicker.weekdays).toHaveLength(7);
    expect(en.datePicker.weekdayNames).toHaveLength(7);
    expect(es.datePicker.weekdays).toHaveLength(
      es.datePicker.weekdayNames.length,
    );
  });

  it("carries the same number of glossary terms in both locales", () => {
    expect(en.glossary.terms).toHaveLength(es.glossary.terms.length);
  });

  it("labels every exposure kind, and names the fallback", () => {
    for (const kind of ["COMPANY", "EQUITY_FUND", "COMMODITY", "CRYPTO"]) {
      expect(exposureKindLabel(en, kind)).not.toBe(
        en.labels.exposureKindFallback,
      );
    }
    expect(exposureKindLabel(en, "NOT_A_KIND")).toBe(
      en.labels.exposureKindFallback,
    );
  });
});
