import { randomUUID } from "node:crypto";
import { copyFileSync } from "node:fs";

import Database from "better-sqlite3";
import { inject } from "vitest";

export function migratedDatabase(path: string): void {
  copyFileSync(inject("templateDatabase"), path);
  const db = new Database(path);
  try {
    db.prepare(`UPDATE "SyncDevice" SET "deviceId" = ?`).run(randomUUID());
  } finally {
    db.close();
  }
}
