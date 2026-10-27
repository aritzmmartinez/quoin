-- One row of owner settings. The CHECK keeps it one row; "residence" has none:
-- it is a vocabulary that grows, validated by the domain at write. One column
-- per setting, so a per-field timestamp can sit beside each.
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
    "residence" TEXT NOT NULL
);

INSERT INTO "Settings" ("id", "residence") VALUES (1, 'bizkaia');
