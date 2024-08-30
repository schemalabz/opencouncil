/*
  Warnings:

  - The primary key for the `CouncilMeeting` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `cityId` to the `SpeakerDiarization` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "DiarizationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "DiarizationRequest_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting" ("id", "cityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CouncilMeeting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
CREATE TABLE "new_SpeakerDiarization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTimestamp" REAL NOT NULL,
    "endTimestamp" REAL NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "personId" TEXT,
    CONSTRAINT "SpeakerDiarization_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting" ("id", "cityId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpeakerDiarization_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SpeakerDiarization_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SpeakerDiarization" ("councilMeetingId", "createdAt", "endTimestamp", "id", "label", "personId", "startTimestamp", "updatedAt") SELECT "councilMeetingId", "createdAt", "endTimestamp", "id", "label", "personId", "startTimestamp", "updatedAt" FROM "SpeakerDiarization";
DROP TABLE "SpeakerDiarization";
ALTER TABLE "new_SpeakerDiarization" RENAME TO "SpeakerDiarization";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DiarizationRequest_councilMeetingId_cityId_key" ON "DiarizationRequest"("councilMeetingId", "cityId");
