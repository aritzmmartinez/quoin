-- CreateTable
CREATE TABLE "PairedDevice" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "pairedAt" DATETIME NOT NULL,
    "lastSyncAt" DATETIME,
    "lastAddress" TEXT,
    "lastCounts" TEXT,
    "revokedAt" DATETIME
);

-- CreateTable
CREATE TABLE "SyncServer" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 3443
);
