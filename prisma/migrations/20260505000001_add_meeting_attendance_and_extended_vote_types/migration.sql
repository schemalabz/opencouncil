-- AlterEnum
ALTER TYPE "VoteType" ADD VALUE 'PRESENT';
ALTER TYPE "VoteType" ADD VALUE 'DID_NOT_VOTE';

-- CreateTable
CREATE TABLE "MeetingAttendance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "source" "DataSource" NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingAttendance_councilMeetingId_cityId_idx" ON "MeetingAttendance"("councilMeetingId", "cityId");

-- CreateIndex
CREATE INDEX "MeetingAttendance_personId_idx" ON "MeetingAttendance"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendance_councilMeetingId_cityId_personId_source_key" ON "MeetingAttendance"("councilMeetingId", "cityId", "personId", "source");

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_cityId_councilMeetingId_fkey" FOREIGN KEY ("cityId", "councilMeetingId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
