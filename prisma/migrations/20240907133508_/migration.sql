/*
  Warnings:

  - You are about to drop the column `cityId` on the `Utterance` table. All the data in the column will be lost.
  - You are about to drop the column `meetingId` on the `Utterance` table. All the data in the column will be lost.
  - You are about to drop the column `speakerTagId` on the `Utterance` table. All the data in the column will be lost.
  - Added the required column `speakerSegmentId` to the `Utterance` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "SpeakerSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTimestamp" REAL NOT NULL,
    "endTimestamp" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "meetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "speakerTagId" TEXT NOT NULL,
    CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey" FOREIGN KEY ("meetingId", "cityId") REFERENCES "CouncilMeeting" ("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpeakerSegment_speakerTagId_fkey" FOREIGN KEY ("speakerTagId") REFERENCES "SpeakerTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Utterance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTimestamp" REAL NOT NULL,
    "endTimestamp" REAL NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "speakerSegmentId" TEXT NOT NULL,
    CONSTRAINT "Utterance_speakerSegmentId_fkey" FOREIGN KEY ("speakerSegmentId") REFERENCES "SpeakerSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Utterance" ("createdAt", "endTimestamp", "id", "startTimestamp", "text", "updatedAt") SELECT "createdAt", "endTimestamp", "id", "startTimestamp", "text", "updatedAt" FROM "Utterance";
DROP TABLE "Utterance";
ALTER TABLE "new_Utterance" RENAME TO "Utterance";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
