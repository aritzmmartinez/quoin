-- Replace LedgerEntry.sleeve with Instrument.thesis.
--
-- `sleeve` recorded where an operation came from and was written by the
-- ingestion adapters as the literal 'CORE', always. It keyed AVCO lots, FIFO
-- queues, wash-sale candidates and trade metadata, so the same instrument could
-- be ring-fenced into two positions — a partition no real row ever used, and one
-- that would have changed a declared fiscal gain the day one did.
--
-- `thesis` answers a different question — why the instrument is held — which is
-- a property of the asset and changes over time, so it belongs on Instrument and
-- is set by hand. Every existing instrument starts at CORE: nothing is inferred
-- from exposureKind or any other column, because a guess here is a claim about
-- the author's intent that no stored data supports.
--
-- The CHECK is added with the column, unlike `sleeve`, which had none. Once the
-- value is editable from the UI an unexpected string would insert cleanly and
-- then throw in `rowToInstrument` on the next read, taking down every screen
-- that lists instruments — the exact failure `LedgerEntry_type_check` exists to
-- prevent.
ALTER TABLE "Instrument" ADD COLUMN "thesis" TEXT NOT NULL DEFAULT 'CORE'
    CHECK ("thesis" IN ('CORE', 'CONVICTION', 'TACTICAL'));

-- DROP COLUMN, not a table rebuild. SQLite rebuilds the table for most column
-- changes and a rebuild would silently drop "LedgerEntry_type_check" along with
-- it; dropping a column the CHECK does not reference leaves the constraint in
-- place. Verified: the type CHECK still fires after this statement.
ALTER TABLE "LedgerEntry" DROP COLUMN "sleeve";
