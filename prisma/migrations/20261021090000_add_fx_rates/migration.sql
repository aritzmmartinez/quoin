-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "rate" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FxSync" (
    "series" TEXT NOT NULL PRIMARY KEY,
    "checkedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "FxRate_quote_idx" ON "FxRate"("quote");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_source_base_quote_day_key" ON "FxRate"("source", "base", "quote", "day");
