-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Word" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "startTimestamp" REAL NOT NULL,
    "endTimestamp" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "utteranceId" TEXT NOT NULL,
    CONSTRAINT "Word_utteranceId_fkey" FOREIGN KEY ("utteranceId") REFERENCES "Utterance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Word" ("createdAt", "endTimestamp", "id", "startTimestamp", "text", "updatedAt", "utteranceId") SELECT "createdAt", "endTimestamp", "id", "startTimestamp", "text", "updatedAt", "utteranceId" FROM "Word";
DROP TABLE "Word";
ALTER TABLE "new_Word" RENAME TO "Word";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
