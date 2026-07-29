-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instrumentId" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'YAHOO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PriceSnapshot_instrumentId_idx" ON "PriceSnapshot"("instrumentId");

-- CreateIndex
CREATE INDEX "PriceSnapshot_asOf_idx" ON "PriceSnapshot"("asOf");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_instrumentId_asOf_key" ON "PriceSnapshot"("instrumentId", "asOf");
