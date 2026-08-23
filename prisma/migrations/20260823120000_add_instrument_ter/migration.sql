-- Total expense ratio, as an annual fraction stored as a decimal string
-- ("0.0022" = 0,22% a year). Set by hand on the instruments screen; ingestion
-- never writes it, like `quoteSymbol` and the exposure columns.
--
-- No CHECK constraint here on purpose. The range is enforced at the write
-- boundary (the form refuses anything outside 0–5%), and a constraint the
-- domain also enforced would be a second place to keep in step — the same
-- drift that made `LedgerEntry.type` a trap. A row the database accepts but
-- the domain refuses takes down every screen that reads instruments.
ALTER TABLE "Instrument" ADD COLUMN "ter" TEXT;
