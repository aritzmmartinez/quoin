import { describe, expect, it } from "vitest";

import {
  type DatabaseTarget,
  realDatabasePath,
  scratchDatabasePath,
} from "./db-target";
import { migrateDevRefusal, shouldBackupBeforeDeploy } from "./migrate-guard";

const LEDGER: DatabaseTarget = { kind: "ledger", path: realDatabasePath() };
const SCRATCH: DatabaseTarget = {
  kind: "scratch",
  path: scratchDatabasePath(),
};
const OTHER: DatabaseTarget = { kind: "other", path: "/elsewhere.sqlite" };
const UNRESOLVED: DatabaseTarget = { kind: "unresolved", url: undefined };

describe("shouldBackupBeforeDeploy", () => {
  it("backs up the ledger when migrations are pending", () => {
    expect(shouldBackupBeforeDeploy(LEDGER, true, 1)).toBe(true);
  });

  it("does not back up the ledger when the schema is current", () => {
    expect(shouldBackupBeforeDeploy(LEDGER, true, 0)).toBe(false);
  });

  it("backs up when migrate status could not answer, as the entrypoint does", () => {
    expect(shouldBackupBeforeDeploy(LEDGER, true, null)).toBe(true);
    expect(shouldBackupBeforeDeploy(LEDGER, true, 2)).toBe(true);
  });

  it("has nothing to back up when the ledger does not exist yet", () => {
    expect(shouldBackupBeforeDeploy(LEDGER, false, 1)).toBe(false);
  });

  it.each([
    ["the scratch database", SCRATCH],
    ["another file", OTHER],
    ["an unresolved URL", UNRESOLVED],
  ])("never backs up for %s, because db:backup snapshots the ledger", (_l, t) => {
    expect(shouldBackupBeforeDeploy(t, true, 1)).toBe(false);
  });
});

describe("migrateDevRefusal", () => {
  it("refuses the live ledger and sends to db:deploy", () => {
    expect(migrateDevRefusal(LEDGER)).toMatch(/live ledger/);
    expect(migrateDevRefusal(LEDGER)).toMatch(/pnpm db:deploy/);
  });

  it.each([
    ["the scratch database", SCRATCH],
    ["another file", OTHER],
    ["an unresolved URL", UNRESOLVED],
  ])("lets %s through", (_l, t) => {
    expect(migrateDevRefusal(t)).toBeNull();
  });
});
