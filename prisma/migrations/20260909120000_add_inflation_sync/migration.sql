-- When each inflation series was last fetched from the provider.
--
-- Deliberately separate from InflationIndex.createdAt: that timestamp only moves
-- when a NEW month is inserted, so a re-sync that finds nothing new never
-- refreshed it, and the real-basis view could not tell "checked yesterday, INE
-- had nothing new" from "not checked in months". This row records the question
-- (did we ask?), not the answer (did the data change?). One row per series,
-- upserted on every sync attempt, INE reachable or not.
CREATE TABLE "InflationSync" (
    "series" TEXT NOT NULL PRIMARY KEY,
    "checkedAt" DATETIME NOT NULL
);
