-- The savings plan, versioned by activeFrom and never edited in place: the
-- target in force on a date is the latest activeFrom <= that date. Amounts are
-- stored; weights are derived at read time and never stored.
CREATE TABLE "PortfolioTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "activeFrom" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PortfolioTarget_activeFrom_idx" ON "PortfolioTarget"("activeFrom");

-- instrumentId has no foreign key on purpose: a plan may name an instrument
-- that has never been traded, and therefore has no Instrument row yet.
CREATE TABLE "PortfolioTargetLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "monthlyAmount" TEXT NOT NULL,
    CONSTRAINT "PortfolioTargetLine_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PortfolioTarget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PortfolioTargetLine_targetId_instrumentId_key" ON "PortfolioTargetLine"("targetId", "instrumentId");

CREATE INDEX "PortfolioTargetLine_targetId_idx" ON "PortfolioTargetLine"("targetId");
