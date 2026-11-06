import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const READ = /^\s*(select|pragma)\b/i;

export const TRANSACTION_MAX_WAIT_MS = 10_000;

function refuseWrite(sql: string): void {
  if (READ.test(sql)) return;
  throw new Error(
    `A write outside a transaction was refused: "${sql.slice(0, 60)}". Use prisma.$transaction(fn).`,
  );
}

export class GuardedBetterSqlite3 extends PrismaBetterSqlite3 {
  override async connect(): ReturnType<PrismaBetterSqlite3["connect"]> {
    const connection = await super.connect();
    const { queryRaw, executeRaw } = connection;
    connection.queryRaw = async (query) => {
      refuseWrite(query.sql);
      return queryRaw.call(connection, query);
    };
    connection.executeRaw = async (query) => {
      refuseWrite(query.sql);
      return executeRaw.call(connection, query);
    };
    return connection;
  }
}
