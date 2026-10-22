-- Written by hand: `prisma migrate dev` rebuilds the table for this, and the
-- rebuild drops the CHECK on "thesis", which lives only in migration SQL.
ALTER TABLE "Instrument" DROP COLUMN "currency";
