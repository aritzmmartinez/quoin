-- Written by hand: `prisma migrate dev` rebuilds the table for this, and a rebuild
-- would have to restate its CHECK.
ALTER TABLE "Instrument" ADD COLUMN "priceSeriesVersion" TEXT;
