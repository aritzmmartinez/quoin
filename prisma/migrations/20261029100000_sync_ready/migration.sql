-- What sync needs stored. New tables, ADD COLUMN and one DROP COLUMN only: none of
-- them rebuilds a table, so the CHECKs that live only in migration SQL survive.

-- 1. This database's identity, created once, and the last mark it issued. A mark is
--    "<ms, 15 digits>-<counter, 4 digits>-<deviceId>". Copying the file copies the
--    identity too, which is why an import refuses a file carrying its own id.
CREATE TABLE "SyncDevice" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
    "deviceId" TEXT NOT NULL,
    "name" TEXT,
    "lastHlc" TEXT
);

INSERT INTO "SyncDevice" ("id", "deviceId") VALUES (1, lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
));

-- 2. Every device this one has merged from, and the newest mark of that device
--    whose effect it has seen. Learned from imports, never from the clock.
CREATE TABLE "SyncPeer" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "seen" TEXT NOT NULL,
    "lastSyncedAt" DATETIME
);

-- 3. What was deleted, so a merge does not bring it back. Never purged.
CREATE TABLE "SyncTombstone" (
    "entity" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hlc" TEXT NOT NULL,
    PRIMARY KEY ("entity", "key")
);

-- 4. The mark of each hand-set field. Null: not changed since this migration.
ALTER TABLE "Instrument" ADD COLUMN "quoteSymbolHlc" TEXT;
ALTER TABLE "Instrument" ADD COLUMN "exposureHlc" TEXT;
ALTER TABLE "Instrument" ADD COLUMN "terHlc" TEXT;
ALTER TABLE "Instrument" ADD COLUMN "hedgedToBaseHlc" TEXT;
ALTER TABLE "Instrument" ADD COLUMN "thesisHlc" TEXT;
ALTER TABLE "Settings" ADD COLUMN "residenceHlc" TEXT;

-- 5. A fund's composition as one block: the day it describes, whether that day was
--    read from the file or is the day of the import, and its mark.
CREATE TABLE "EtfHoldingBlock" (
    "instrumentId" TEXT NOT NULL PRIMARY KEY,
    "asOf" TEXT NOT NULL
        CHECK ("asOf" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    "asOfInferred" BOOLEAN NOT NULL DEFAULT false,
    "hlc" TEXT,
    CONSTRAINT "EtfHoldingBlock_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- A day read from the file was stored as its UTC midnight; anything else was the
-- instant of the import, whose day is Madrid's (the only residence there was), with
-- the EU rule written out as in 20261028090000_target_active_day.
INSERT INTO "EtfHoldingBlock" ("instrumentId", "asOf", "asOfInferred")
    SELECT "instrumentId",
        CASE WHEN substr("asOf", 12, 12) = '00:00:00.000' THEN substr("asOf", 1, 10)
        ELSE date("asOf", CASE
            WHEN julianday("asOf") >= julianday(strftime('%Y', "asOf") || '-03-31', '-6 days', 'weekday 0', '+1 hour')
             AND julianday("asOf") <  julianday(strftime('%Y', "asOf") || '-10-31', '-6 days', 'weekday 0', '+1 hour')
            THEN '+2 hours' ELSE '+1 hour' END)
        END,
        substr("asOf", 12, 12) <> '00:00:00.000'
    FROM (SELECT "instrumentId", max("asOf") AS "asOf" FROM "EtfHolding" GROUP BY "instrumentId");

-- The block is now the only place the day lives. The column is in no index, key or
-- CHECK, so dropping it does not rebuild the table.
ALTER TABLE "EtfHolding" DROP COLUMN "asOf";
