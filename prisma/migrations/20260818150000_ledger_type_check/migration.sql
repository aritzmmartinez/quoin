-- Constrain LedgerEntry.type to what the domain actually models.
--
-- The column accepted any string, and the schema comment advertised FEE,
-- TAX_WITHHOLDING and SPLIT, none of which `ledgerEventSchema` models. A row
-- with one of those is accepted on insert and then throws in `rowToEvent` on
-- every read, so the failure surfaces on a screen far from the write that caused
-- it. That is exactly what the demo seed did with a single FEE row: one row, and
-- every screen returned 500.
--
-- SQLite cannot add a CHECK in place, so the table is rebuilt. Rows are copied
-- inside the migration's transaction: if any existing row holds a type outside
-- the list, the copy fails with "CHECK constraint failed" and the migration
-- rolls back leaving the ledger untouched. That is the intended outcome — such a
-- row cannot be read by the application today either, so it must be corrected
-- deliberately rather than carried forward.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ts" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "sleeve" TEXT,
    "instrumentId" TEXT,
    "quantity" TEXT,
    "price" TEXT,
    "grossAmount" TEXT NOT NULL,
    "fees" TEXT NOT NULL DEFAULT '0',
    "taxWithheld" TEXT NOT NULL DEFAULT '0',
    "currency" TEXT NOT NULL,
    "fxToBase" TEXT NOT NULL DEFAULT '1',
    "account" TEXT NOT NULL DEFAULT 'trade-republic',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_type_check" CHECK ("type" IN ('BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'INTEREST')),
    CONSTRAINT "LedgerEntry_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_LedgerEntry" ("id", "ts", "type", "sleeve", "instrumentId", "quantity", "price", "grossAmount", "fees", "taxWithheld", "currency", "fxToBase", "account", "source", "externalId", "note", "createdAt")
SELECT "id", "ts", "type", "sleeve", "instrumentId", "quantity", "price", "grossAmount", "fees", "taxWithheld", "currency", "fxToBase", "account", "source", "externalId", "note", "createdAt"
FROM "LedgerEntry";

DROP TABLE "LedgerEntry";

ALTER TABLE "new_LedgerEntry" RENAME TO "LedgerEntry";

CREATE UNIQUE INDEX "LedgerEntry_source_externalId_key" ON "LedgerEntry"("source", "externalId");
CREATE INDEX "LedgerEntry_ts_idx" ON "LedgerEntry"("ts");
CREATE INDEX "LedgerEntry_instrumentId_idx" ON "LedgerEntry"("instrumentId");

PRAGMA foreign_keys=ON;
