-- Monthly consumer price index levels, one row per series and month.
--
-- Append-only and idempotent by (series, period), like PriceSnapshot. The extra
-- `base` column is what a price series does not need: a past price never
-- changes, a past index level does, because the whole series is republished
-- against a new reference year every few years. Keeping the base makes a rebase
-- visible to `ipc:sync` instead of leaving old and new levels side by side.
CREATE TABLE "InflationIndex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "series" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "indexValue" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'INE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "InflationIndex_series_period_key" ON "InflationIndex"("series", "period");

CREATE INDEX "InflationIndex_series_idx" ON "InflationIndex"("series");
