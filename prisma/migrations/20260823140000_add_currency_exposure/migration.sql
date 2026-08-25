-- Currency of business, in the two places it is actually knowable.
--
-- `SecurityIdentity.exchCode` — the Bloomberg composite exchange code of a
-- share class's primary listing, as OpenFIGI returned it. The CODE is stored
-- and the currency derived at read time, because the code is the fact and the
-- currency is a view of it: fixing a wrong entry in the translation table must
-- not cost a re-resolution of every identity in the cache.
--
-- Existing rows stay NULL. The cache never re-asks an identity it has already
-- resolved, so filling them in takes `pnpm identity:resolve --refresh`.
ALTER TABLE "SecurityIdentity" ADD COLUMN "exchCode" TEXT;

-- `Instrument.hedgedToBase` — whether the vehicle hedges its currency exposure
-- back to EUR. Not derivable from any listing: a EUR-hedged gold ETC and an
-- unhedged one trade on the same venue in the same currency and differ only in
-- the prospectus. A human reads the KID and sets it once, exactly like `ter`,
-- and ingestion must never write it.
--
-- Stored as INTEGER: SQLite has no boolean, and Prisma maps Boolean to 0/1.
ALTER TABLE "Instrument" ADD COLUMN "hedgedToBase" BOOLEAN NOT NULL DEFAULT false;
