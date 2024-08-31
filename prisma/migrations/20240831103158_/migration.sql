-- CreateTable
CREATE TABLE "TranscriptionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "jobId" TEXT,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "TranscriptionRequest_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting" ("id", "cityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptionRequest_councilMeetingId_cityId_key" ON "TranscriptionRequest"("councilMeetingId", "cityId");
