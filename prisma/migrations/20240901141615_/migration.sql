-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_short" TEXT NOT NULL,
    "name_short_en" TEXT NOT NULL,
    "image" TEXT,
    "role" TEXT,
    "role_en" TEXT,
    "activeFrom" DATETIME,
    "activeTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cityId" TEXT NOT NULL,
    "partyId" TEXT,
    CONSTRAINT "Person_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Person_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Person" ("activeFrom", "activeTo", "cityId", "createdAt", "id", "image", "name", "name_en", "name_short", "name_short_en", "partyId", "role", "role_en", "updatedAt") SELECT "activeFrom", "activeTo", "cityId", "createdAt", "id", "image", "name", "name_en", "name_short", "name_short_en", "partyId", "role", "role_en", "updatedAt" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
