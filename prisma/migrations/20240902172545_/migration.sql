/*
  Warnings:

  - You are about to drop the `DiarizationRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TranscriptionRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DiarizationRequest";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TranscriptionRequest";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "TaskStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "type" TEXT NOT NULL,
    "requestBody" TEXT NOT NULL,
    "responseBody" TEXT,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "TaskStatus_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting" ("id", "cityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskStatus_councilMeetingId_cityId_key" ON "TaskStatus"("councilMeetingId", "cityId");
