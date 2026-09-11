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

  it("offers a sync when no index is stored", () => {
    const notice = basisNotice({ ...base, hasIndex: false });
    expect(notice?.offerSync).toBe(true);
    expect(notice?.body).toBe(es.basis.noIndex);
  });

  it("offers a sync when a month inside the range is missing", () => {
    const notice = basisNotice({
      ...base,
      active: false,
      missing: ["2026-03"],
    });
    expect(notice?.offerSync).toBe(true);
    expect(notice?.body).toContain("marzo");
  });

  it("offers a sync when real mode works but the series is stale", () => {
    const notice = basisNotice({ ...base, checkStale: true });
    expect(notice?.offerSync).toBe(true);
    expect(notice?.body).toContain(es.basis.maybeBehind);
  });

  it("does not offer a sync when real mode works and the series is fresh", () => {
    const notice = basisNotice(base);
    expect(notice?.offerSync).toBe(false);
    expect(notice?.body).toContain(es.basis.lag);
  });
});
