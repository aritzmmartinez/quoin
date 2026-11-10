import {
  describeDatabase,
  type DatabaseTarget,
} from "~/adapters/persistence/database-target";

export const isPortInUse = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException | null)?.code === "EADDRINUSE";

export function describeListener(
  event: "listening" | "port-in-use",
  port: number,
  target: DatabaseTarget,
  dev: boolean,
): string {
  const database = describeDatabase(target, true);
  if (event === "listening") {
    return `quoin sync: listening on port ${port} — ${database}`;
  }
  const hint = dev ? " (another pnpm dev?)" : "";
  return `quoin sync: port ${port} is in use by another process${hint}; not listening — ${database}`;
}
