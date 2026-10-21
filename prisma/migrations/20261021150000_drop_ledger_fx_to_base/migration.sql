-- Written by hand: `prisma migrate dev` rebuilds the table for this, and a rebuild
-- drops every CHECK on "LedgerEntry", which live only in migration SQL. The column
-- sits in no index and no CHECK.
ALTER TABLE "LedgerEntry" DROP COLUMN "fxToBase";
