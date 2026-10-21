import { type DatabaseTarget, REAL_DATABASE_FILE } from "./db-target";

export function shouldBackupBeforeDeploy(
  target: DatabaseTarget,
  ledgerExists: boolean,
  statusExit: number | null,
): boolean {
  return target.kind === "ledger" && ledgerExists && statusExit !== 0;
}

export function migrateDevRefusal(target: DatabaseTarget): string | null {
  if (target.kind !== "ledger") return null;

  return (
    `Refusing to run prisma migrate dev against the live ledger ` +
    `(${REAL_DATABASE_FILE}). It is for writing migrations, and on drift it ` +
    `offers to reset the database. Apply pending migrations with ` +
    `\`pnpm db:deploy\`, which backs the ledger up first.`
  );
}
