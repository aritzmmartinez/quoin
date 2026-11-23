import { describe, expect, it } from "vitest";

import { backupZoneOf } from "./residence";

describe("backupZoneOf", () => {
  it("names a sync backup's day in the residence's zone", () => {
    expect(backupZoneOf("bizkaia")).toBe("Europe/Madrid");
    expect(backupZoneOf("canarias")).toBe("Atlantic/Canary");
  });

  it("still names one in UTC for a residence this version does not know", () => {
    expect(backupZoneOf("atlantis")).toBe("UTC");
  });
});
