-- PortfolioTarget.activeFrom becomes a calendar day (TEXT "YYYY-MM-DD") instead of
-- an instant, with one version per day. ADD COLUMN, DROP INDEX, DROP COLUMN and
-- RENAME COLUMN only: none of them rebuilds a table.

-- 1. Refuse before touching anything if a stored value cannot be read as an
--    instant. Prisma always wrote ISO text, so this never fires; if it did, a NULL
--    day would take down every screen that lists targets, far from here.
CREATE TABLE IF NOT EXISTS "_TargetActiveDayGuard" (
    "unreadable" INTEGER NOT NULL CHECK ("unreadable" = 0)
);
INSERT INTO "_TargetActiveDayGuard" ("unreadable")
    SELECT count(*) FROM "PortfolioTarget" WHERE julianday("activeFrom") IS NULL;
DROP TABLE "_TargetActiveDayGuard";

-- 2. The day each version began, in Madrid (the zone of the only residence that
--    existed). SQLite has no zone database, so the EU rule is written out: UTC+2
--    from 01:00Z on the last Sunday of March to 01:00Z on the last Sunday of
--    October, UTC+1 otherwise. Checked against Intl for every quarter-hour and the
--    millisecond before it from 1996 to 2040, without a mismatch.
ALTER TABLE "PortfolioTarget" ADD COLUMN "activeDay" TEXT
    CHECK ("activeDay" IS NULL OR "activeDay" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]');

UPDATE "PortfolioTarget" SET "activeDay" = date("activeFrom", CASE
    WHEN julianday("activeFrom") >= julianday(strftime('%Y', "activeFrom") || '-03-31', '-6 days', 'weekday 0', '+1 hour')
     AND julianday("activeFrom") <  julianday(strftime('%Y', "activeFrom") || '-10-31', '-6 days', 'weekday 0', '+1 hour')
    THEN '+2 hours' ELSE '+1 hour' END);

-- 3. One version per day. Where a day has several, keep the one that was in force
--    (latest activeFrom, then latest createdAt, then id so a full tie still leaves
--    exactly one) and delete the rest with their lines. The migration must not
--    fail on a duplicate: the container migrates on start.
CREATE TABLE "_TargetSuperseded" ("id" TEXT NOT NULL PRIMARY KEY);
INSERT INTO "_TargetSuperseded" ("id")
    SELECT t."id" FROM "PortfolioTarget" t
    WHERE EXISTS (
        SELECT 1 FROM "PortfolioTarget" o
        WHERE o."activeDay" = t."activeDay" AND o."id" <> t."id"
          AND (julianday(o."activeFrom") > julianday(t."activeFrom")
            OR (julianday(o."activeFrom") = julianday(t."activeFrom")
                AND (julianday(o."createdAt") > julianday(t."createdAt")
                  OR (julianday(o."createdAt") = julianday(t."createdAt") AND o."id" > t."id"))))
    );
DELETE FROM "PortfolioTargetLine" WHERE "targetId" IN (SELECT "id" FROM "_TargetSuperseded");
DELETE FROM "PortfolioTarget" WHERE "id" IN (SELECT "id" FROM "_TargetSuperseded");
DROP TABLE "_TargetSuperseded";

-- 4. Swap the columns. The index on the old column goes first: SQLite refuses to
--    drop an indexed column.
DROP INDEX "PortfolioTarget_activeFrom_idx";
ALTER TABLE "PortfolioTarget" DROP COLUMN "activeFrom";
ALTER TABLE "PortfolioTarget" RENAME COLUMN "activeDay" TO "activeFrom";
CREATE UNIQUE INDEX "PortfolioTarget_activeFrom_key" ON "PortfolioTarget"("activeFrom");
