import { describe, expect, it } from "vitest";

import { es } from "~/lib";

import { basisNotice, type BasisNoticeProps } from "./basis-notice";

const base: BasisNoticeProps = {
  basis: "real",
  active: true,
  missing: [],
  hasIndex: true,
  checkStale: false,
};

describe("basisNotice", () => {
  it("says nothing on the nominal basis", () => {
    expect(basisNotice({ ...base, basis: "nominal" })).toBeNull();
  });

  it("reports that no index is stored", () => {
    expect(basisNotice({ ...base, hasIndex: false })).toBe(es.basis.noIndex);
  });

  it("names the missing months inside the range", () => {
    const notice = basisNotice({
      ...base,
      active: false,
      missing: ["2026-03"],
    });
    expect(notice).toContain("marzo");
    expect(notice).toContain(es.basis.showingNominal);
  });

  it("reports a stale series when real mode works", () => {
    expect(basisNotice({ ...base, checkStale: true })).toBe(
      es.basis.maybeBehind,
    );
  });

  it("says nothing when real mode works and the series is fresh", () => {
    expect(basisNotice(base)).toBeNull();
  });
});
