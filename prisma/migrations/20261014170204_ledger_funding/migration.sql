-- How an acquisition was paid for: CASH (money left the bank) or IN_KIND (units
-- arrived with no money behind them — a Kraken reward, a Trade Republic saveback).
--
-- Written by hand. `prisma migrate dev` generated a table rebuild for this, and a
-- rebuild drops "LedgerEntry_type_check", which lives only in migration SQL.
-- ADD COLUMN keeps the table, and its CHECK, exactly as they are.
ALTER TABLE "LedgerEntry" ADD COLUMN "funding" TEXT NOT NULL DEFAULT 'CASH'
  CONSTRAINT "LedgerEntry_funding_check" CHECK ("funding" IN ('CASH', 'IN_KIND'));

-- Kraken rewards already imported carry their mapper's note on both legs, so they
-- can be classified from the ledger alone. Trade Republic saveback cannot: its rows
-- were never stored, and a re-import is what marks those purchases.
UPDATE "LedgerEntry"
SET "funding" = 'IN_KIND'
WHERE "source" = 'KRAKEN_CSV'
  AND "note" IN ('kraken-reward', 'kraken-reward-income');
