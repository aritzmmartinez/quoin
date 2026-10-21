import { describe, expect, it } from "vitest";

import { en } from "./en";
import { es } from "./es";

describe("common.halted", () => {
  it("keeps the whole cause and ends it with one full stop", () => {
    expect(es.common.halted("Error: no such table.")).toMatch(
      /^Se ha detenido sin terminar: Error: no such table\. No es/,
    );
    expect(en.common.halted("Error: no such table")).toMatch(
      /^Stopped before finishing: Error: no such table\. This is/,
    );
  });
});
