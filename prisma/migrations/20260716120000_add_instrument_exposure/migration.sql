-- Exposure classification for look-through.
-- Trade Republic maps both FUND and SYNTHETIC to type "ETF", so a gold ETC is
-- indistinguishable from an equity fund. These columns carry the classification
-- a human supplies via `pnpm exposure:map`; ingestion never writes them.
ALTER TABLE "Instrument" ADD COLUMN "exposureKind" TEXT;
ALTER TABLE "Instrument" ADD COLUMN "exposureLeafId" TEXT;
