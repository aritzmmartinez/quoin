-- Written by hand, ADD COLUMN only: `prisma migrate dev` rebuilds the table for
-- this, and a rebuild drops the CHECKs on "type" and "funding", which live only in
-- migration SQL.
--
-- The CHECKs name values only. The rule tying fxSource to the currency and the
-- rate lives in the domain, at write: here it would make this ADD COLUMN fail on
-- any ledger that already holds a non-EUR row booked one-to-one, and that
-- container would never start.
ALTER TABLE "LedgerEntry" ADD COLUMN "fxSource" TEXT NOT NULL DEFAULT 'IDENTITY'
  CONSTRAINT "LedgerEntry_fxSource_check"
  CHECK ("fxSource" IN ('IDENTITY', 'BROKER', 'ECB', 'MARKET', 'MANUAL'));
ALTER TABLE "LedgerEntry" ADD COLUMN "fxDate" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "fxRate" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "fxDirection" TEXT
  CONSTRAINT "LedgerEntry_fxDirection_check"
  CHECK ("fxDirection" IN ('QUOTE_PER_BASE', 'BASE_PER_QUOTE'));
ALTER TABLE "LedgerEntry" ADD COLUMN "originalAmount" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "originalCurrency" TEXT;

UPDATE "LedgerEntry"
SET "originalAmount" = "grossAmount", "originalCurrency" = "currency";
