import { PrismaClient } from "./generated/client";
import { GuardedBetterSqlite3, TRANSACTION_MAX_WAIT_MS } from "./write-guard";

// Prisma 7 requires a driver adapter; SQLite uses better-sqlite3.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new GuardedBetterSqlite3({ url });

// Cache the client on globalThis in development so HMR doesn't open many connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    transactionOptions: { maxWait: TRANSACTION_MAX_WAIT_MS },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
