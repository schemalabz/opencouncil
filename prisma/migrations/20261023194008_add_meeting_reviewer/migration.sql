-- CreateTable
CREATE TABLE "MeetingReviewer" (
    "id" TEXT NOT NULL,
    "meetingCityId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingReviewer_meetingCityId_meetingId_key" ON "MeetingReviewer"("meetingCityId", "meetingId");

-- AddForeignKey
ALTER TABLE "MeetingReviewer" ADD CONSTRAINT "MeetingReviewer_meetingCityId_meetingId_fkey" FOREIGN KEY ("meetingCityId", "meetingId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingReviewer" ADD CONSTRAINT "MeetingReviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

