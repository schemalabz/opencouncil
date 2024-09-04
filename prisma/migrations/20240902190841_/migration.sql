/*
  Warnings:

  - You are about to drop the `SpeakerDiarization` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SpeakerDiarization";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SpeakerTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "label" TEXT,
    "personId" TEXT,
    CONSTRAINT "SpeakerTag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Utterance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTimestamp" REAL NOT NULL,
    "endTimestamp" REAL NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "speakerTagId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "Utterance_speakerTagId_fkey" FOREIGN KEY ("speakerTagId") REFERENCES "SpeakerTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Utterance_meetingId_cityId_fkey" FOREIGN KEY ("meetingId", "cityId") REFERENCES "CouncilMeeting" ("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Word" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "startTimestamp" REAL NOT NULL,
    "endTimestamp" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "utteranceId" TEXT NOT NULL,
    CONSTRAINT "Word_utteranceId_fkey" FOREIGN KEY ("utteranceId") REFERENCES "Utterance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "CouncilMeeting_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CouncilMeeting" ("cityId", "createdAt", "dateTime", "id", "name", "name_en", "released", "updatedAt", "video") SELECT "cityId", "createdAt", "dateTime", "id", "name", "name_en", "released", "updatedAt", "video" FROM "CouncilMeeting";
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
    "logo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "Party_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Party" ("cityId", "colorHex", "createdAt", "id", "logo", "name", "name_en", "name_short", "name_short_en", "updatedAt") SELECT "cityId", "colorHex", "createdAt", "id", "logo", "name", "name_en", "name_short", "name_short_en", "updatedAt" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
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
    CONSTRAINT "Person_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Person_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Person" ("activeFrom", "activeTo", "cityId", "createdAt", "id", "image", "name", "name_en", "name_short", "name_short_en", "partyId", "role", "role_en", "updatedAt") SELECT "activeFrom", "activeTo", "cityId", "createdAt", "id", "image", "name", "name_en", "name_short", "name_short_en", "partyId", "role", "role_en", "updatedAt" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE TABLE "new_TaskStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "type" TEXT NOT NULL,
    "requestBody" TEXT NOT NULL,
    "responseBody" TEXT,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "TaskStatus_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting" ("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskStatus" ("cityId", "councilMeetingId", "createdAt", "id", "requestBody", "responseBody", "status", "type", "updatedAt") SELECT "cityId", "councilMeetingId", "createdAt", "id", "requestBody", "responseBody", "status", "type", "updatedAt" FROM "TaskStatus";
DROP TABLE "TaskStatus";
ALTER TABLE "new_TaskStatus" RENAME TO "TaskStatus";
CREATE UNIQUE INDEX "TaskStatus_councilMeetingId_cityId_key" ON "TaskStatus"("councilMeetingId", "cityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
