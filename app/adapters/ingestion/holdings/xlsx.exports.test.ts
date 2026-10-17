import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseHoldingsCsv } from "./parse";
import { xlsxToHoldingsCsv } from "./xlsx";

/**
 * Real issuer exports, read from the gitignored data/ folder of whoever runs the
 * suite: the set of funds imported is the portfolio, so these files never enter the
 * repository. Skipped in CI and when the folder is empty. Nothing about a file —
 * its name, a sheet, a fund or a holding — reaches the output: a failure names the
 * export by position and the check that failed, and every assertion is a boolean.
 */
const DIR = fileURLToPath(new URL("../../../../data/fixtures/holdings", import.meta.url));
const files = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((name) => /\.xlsx$/i.test(name))
      .sort()
      .map((name) => join(DIR, name))
  : [];

describe.skipIf(Boolean(process.env.CI) || files.length === 0)(
  "real issuer exports in data/fixtures/holdings",
  () => {
    it.each(files.map((path, i) => ({ path, n: i + 1 })))(
      "export #$n parses as one holdings table",
      ({ path, n }) => {
        let parsed: ReturnType<typeof parseHoldingsCsv>;
        try {
          const file = readFileSync(path);
          parsed = parseHoldingsCsv(xlsxToHoldingsCsv(new Uint8Array(file).buffer));
        } catch {
          throw new Error(`export #${n} did not parse`);
        }
        const covered = Number(parsed.covered);
        expect(parsed.holdings.length > 0, `export #${n}: no holdings`).toBe(true);
        expect(
          covered > 0.5 && covered < 1.5,
          `export #${n}: covered weight outside 50%–150%`,
        ).toBe(true);
      },
    );
  },
);
