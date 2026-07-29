-- Cache of raw identity -> canonical id. Resolution happens at import time;
-- nothing at read time touches the network. Misses are cached too, so an
-- identity the provider cannot place is not re-asked on every import.
CREATE TABLE "SecurityIdentity" (
    "identity" TEXT NOT NULL PRIMARY KEY,
    "identityKind" TEXT NOT NULL,
    "canonicalId" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "resolvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "SecurityIdentity_canonicalId_idx" ON "SecurityIdentity"("canonicalId");
