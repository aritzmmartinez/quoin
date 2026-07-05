-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "assetClass" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
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
    CONSTRAINT "LedgerEntry_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LedgerEntry_ts_idx" ON "LedgerEntry"("ts");

-- CreateIndex
CREATE INDEX "LedgerEntry_instrumentId_idx" ON "LedgerEntry"("instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_source_externalId_key" ON "LedgerEntry"("source", "externalId");
