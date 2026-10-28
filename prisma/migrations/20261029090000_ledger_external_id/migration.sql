-- Every entry gets a stable key, (source, externalId), for sync to merge on.
-- An UPDATE only: making the column NOT NULL would rebuild the table and drop the
-- CHECKs on "type", "funding", "fxSource" and "fxDirection". The rule is the
-- domain's, at write (`ledgerEventWriteSchema`); reads stay lenient.
-- The row's own id is already stored, so the key it gets here never changes, and
-- the prefix keeps it from colliding with an id a broker issued.
UPDATE "LedgerEntry" SET "externalId" = 'local:' || "id"
    WHERE "externalId" IS NULL OR "externalId" = '';
