-- Meeting fact sources: the back office's attendance sheet and the transcript as
-- sources of the roll call, the arrivals and departures, and the votes, beside
-- the decision documents (issue #807).

ALTER TYPE "DataSource" ADD VALUE 'sheet';

CREATE TYPE "MeetingFactSourceStatus" AS ENUM ('uploaded', 'read', 'confirmed');

ALTER TABLE "MeetingAttendance" ADD COLUMN "absenceJustified" BOOLEAN;

CREATE TABLE "MeetingFactSource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "status" "MeetingFactSourceStatus" NOT NULL DEFAULT 'uploaded',
    "fileKey" TEXT,
    "fileName" TEXT,
    "mediaType" TEXT,
    "reading" JSONB,
    "readerVersion" TEXT,
    "taskId" TEXT,
    "uploadedById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    CONSTRAINT "MeetingFactSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MeetingFactSource_cityId_councilMeetingId_source_key" ON "MeetingFactSource"("cityId", "councilMeetingId", "source");
CREATE INDEX "MeetingFactSource_taskId_idx" ON "MeetingFactSource"("taskId");
ALTER TABLE "MeetingFactSource" ADD CONSTRAINT "MeetingFactSource_cityId_councilMeetingId_fkey" FOREIGN KEY ("cityId", "councilMeetingId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingFactSource" ADD CONSTRAINT "MeetingFactSource_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingFactSource" ADD CONSTRAINT "MeetingFactSource_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingFactSource" ADD CONSTRAINT "MeetingFactSource_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
