-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_short" TEXT NOT NULL,
    "name_short_en" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "Party_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Party" ("cityId", "colorHex", "createdAt", "id", "logo", "name", "name_en", "name_short", "name_short_en", "updatedAt") SELECT "cityId", "colorHex", "createdAt", "id", "logo", "name", "name_en", "name_short", "name_short_en", "updatedAt" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
