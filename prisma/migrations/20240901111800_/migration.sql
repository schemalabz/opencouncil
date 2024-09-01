/*
  Warnings:

  - Added the required column `name_municipality_en` to the `City` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_City" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_municipality" TEXT NOT NULL,
    "name_municipality_en" TEXT NOT NULL,
    "logoImage" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_City" ("createdAt", "id", "logoImage", "name", "name_en", "name_municipality", "timezone", "updatedAt") SELECT "createdAt", "id", "logoImage", "name", "name_en", "name_municipality", "timezone", "updatedAt" FROM "City";
DROP TABLE "City";
ALTER TABLE "new_City" RENAME TO "City";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
