-- A fund's published composition. Replace-only: importing a holdings file
-- replaces the fund's rows wholesale, because a constituent that left the index
-- must disappear rather than linger.
CREATE TABLE "EtfHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instrumentId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "identityKind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtfHolding_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EtfHolding_instrumentId_identity_key" ON "EtfHolding"("instrumentId", "identity");
CREATE INDEX "EtfHolding_instrumentId_idx" ON "EtfHolding"("instrumentId");
