import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { z } from "zod";

const DIR = fileURLToPath(new URL(".", import.meta.url));

/**
 * One contract case file, `test/contract/<name>.json`, parsed through `schema`.
 * The same files are read by the mobile client's tests, so a case is changed
 * here only together with the implementation that reproduces it there.
 */
export function loadContract<T extends z.ZodType>(
  name: string,
  schema: T,
): z.infer<T> {
  return schema.parse(JSON.parse(readFileSync(`${DIR}${name}.json`, "utf8")));
}
