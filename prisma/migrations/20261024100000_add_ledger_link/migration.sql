-- ADD COLUMN only, and no CHECK: the values are a vocabulary that grows, and
-- widening a CHECK on SQLite rebuilds the table, dropping the CHECKs on "type",
-- "funding", "fxSource" and "fxDirection" that live only in migration SQL. The
-- domain validates both at write.
ALTER TABLE "LedgerEntry" ADD COLUMN "linkId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "linkKind" TEXT;
