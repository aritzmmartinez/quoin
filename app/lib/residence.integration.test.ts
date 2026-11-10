import { mkdirSync, rmSync } from "node:fs";
import { inspect } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migratedDatabase } from "../../test/integration/template";

import { UnsupportedResidenceError } from "~/core/domain";
import { formatHlc } from "~/core/sync";

import { isUnsupportedResidence, UNSUPPORTED_RESIDENCE } from "./residence";

let persistence: typeof import("~/adapters/persistence");
let server: typeof import("./residence.server");
let sync: typeof import("./sync.server");

const tmpDir = "./.tmp-residence";
const dbPath = `${tmpDir}/it-${Date.now()}.sqlite`;
const T = Date.UTC(2030, 0, 1);

const fromAnotherVersion = {
  schemaVersion: 1,
  deviceId: "dev-phone",
  deviceName: "phone",
  exportHlc: formatHlc({ ms: T, counter: 1, deviceId: "dev-phone" }),
  settings: {
    residence: "araba",
    residenceHlc: formatHlc({ ms: T, counter: 0, deviceId: "dev-phone" }),
  },
};

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  process.env.DATABASE_URL = `file:${dbPath}`;
  migratedDatabase(dbPath);
  persistence = await import("~/adapters/persistence");
  server = await import("./residence.server");
  sync = await import("./sync.server");
});

afterAll(async () => {
  await persistence?.prisma.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("a residence this version does not know (integration)", () => {
  const thrownBy = (fn: () => Promise<unknown>) =>
    fn().then(
      () => expect.unreachable("should have thrown"),
      (error: unknown) => error,
    );

  it("is stored as it arrives, and the whole plan still applies", async () => {
    const result = await sync.importSync(fromAnotherVersion, { dryRun: false });

    expect(result.status).toBe("applied");
    expect((await sync.exportSync()).settings.residence).toBe("araba");
  });

  it("makes the repository throw a typed error", async () => {
    const error = await thrownBy(() =>
      new persistence.PrismaSettingsRepository().residence(),
    );
    expect(error).toBeInstanceOf(UnsupportedResidenceError);
  });

  it("reaches a loader as a 409 the boundaries can recognise", async () => {
    const error = await thrownBy(() => server.loadResidence());

    expect(isUnsupportedResidence(error)).toBe(true);
    expect(error).toMatchObject({
      data: { code: UNSUPPORTED_RESIDENCE },
      init: { status: 409 },
    });
  });

  it("reads as its message when a script prints it", async () => {
    const error = await thrownBy(() => server.loadResidence());

    expect(String(error)).toMatch(/araba.*Update Quoin/);
    expect(inspect(error)).toMatch(/araba.*Update Quoin/);
  });

  it("fails each effect with a reason, before asking any provider", async () => {
    await expect(
      sync.runEffect({ kind: "rates", currency: "USD", since: "2030-01-01" }),
    ).resolves.toMatchObject({ ok: false, reason: UNSUPPORTED_RESIDENCE });
    await expect(
      sync.runEffect({
        kind: "prices",
        instrumentId: "XS00TEST0001",
        symbol: "AAA.DE",
      }),
    ).resolves.toMatchObject({ ok: false, reason: UNSUPPORTED_RESIDENCE });
  });

  it("leaves the sync working, so the next exchange can still run", async () => {
    await expect(
      sync.importSync(fromAnotherVersion, { dryRun: false }),
    ).resolves.toMatchObject({ status: "up-to-date" });
  });
});
