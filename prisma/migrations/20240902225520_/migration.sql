/*
  Warnings:

  - You are about to drop the column `video` on the `CouncilMeeting` table. All the data in the column will be lost.
  - Added the required column `youtubeUrl` to the `CouncilMeeting` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TaskStatus" ADD COLUMN "percentComplete" REAL;
ALTER TABLE "TaskStatus" ADD COLUMN "stage" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CouncilMeeting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "dateTime" DATETIME NOT NULL,
    "youtubeUrl" TEXT NOT NULL,
    "videoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "cityId" TEXT NOT NULL,

    PRIMARY KEY ("cityId", "id"),
    CONSTRAINT "CouncilMeeting_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CouncilMeeting" ("cityId", "createdAt", "dateTime", "id", "name", "name_en", "released", "updatedAt") SELECT "cityId", "createdAt", "dateTime", "id", "name", "name_en", "released", "updatedAt" FROM "CouncilMeeting";
DROP TABLE "CouncilMeeting";
ALTER TABLE "new_CouncilMeeting" RENAME TO "CouncilMeeting";
CREATE UNIQUE INDEX "CouncilMeeting_cityId_id_key" ON "CouncilMeeting"("cityId", "id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
