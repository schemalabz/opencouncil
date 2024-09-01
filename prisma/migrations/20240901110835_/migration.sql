/*
  Warnings:

  - You are about to drop the column `fullName` on the `Person` table. All the data in the column will be lost.
  - Added the required column `name_en` to the `City` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_municipality` to the `City` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_en` to the `CouncilMeeting` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_en` to the `Party` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_short` to the `Party` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_short_en` to the `Party` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Person` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_en` to the `Person` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_short` to the `Person` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name_short_en` to the `Person` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_City" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_municipality" TEXT NOT NULL,
    "logoImage" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_City" ("createdAt", "id", "logoImage", "name", "timezone", "updatedAt") SELECT "createdAt", "id", "logoImage", "name", "timezone", "updatedAt" FROM "City";
DROP TABLE "City";
ALTER TABLE "new_City" RENAME TO "City";
CREATE TABLE "new_CouncilMeeting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "dateTime" DATETIME NOT NULL,
    "video" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "cityId" TEXT NOT NULL,

    PRIMARY KEY ("cityId", "id"),
    CONSTRAINT "CouncilMeeting_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CouncilMeeting" ("cityId", "createdAt", "dateTime", "id", "name", "released", "updatedAt", "video") SELECT "cityId", "createdAt", "dateTime", "id", "name", "released", "updatedAt", "video" FROM "CouncilMeeting";
DROP TABLE "CouncilMeeting";
ALTER TABLE "new_CouncilMeeting" RENAME TO "CouncilMeeting";
CREATE UNIQUE INDEX "CouncilMeeting_cityId_id_key" ON "CouncilMeeting"("cityId", "id");
CREATE TABLE "new_Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_short" TEXT NOT NULL,
    "name_short_en" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "Party_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Party" ("cityId", "colorHex", "createdAt", "id", "logo", "name", "updatedAt") SELECT "cityId", "colorHex", "createdAt", "id", "logo", "name", "updatedAt" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_short" TEXT NOT NULL,
    "name_short_en" TEXT NOT NULL,
    "image" TEXT NOT NULL,
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
INSERT INTO "new_Person" ("activeFrom", "activeTo", "cityId", "createdAt", "id", "image", "partyId", "role", "updatedAt") SELECT "activeFrom", "activeTo", "cityId", "createdAt", "id", "image", "partyId", "role", "updatedAt" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
