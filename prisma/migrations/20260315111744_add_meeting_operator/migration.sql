-- CreateTable
CREATE TABLE "MeetingOperator" (
    "id" TEXT NOT NULL,
    "meetingCityId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingOperator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingOperator_meetingCityId_meetingId_key" ON "MeetingOperator"("meetingCityId", "meetingId");

-- AddForeignKey
ALTER TABLE "MeetingOperator" ADD CONSTRAINT "MeetingOperator_meetingCityId_meetingId_fkey" FOREIGN KEY ("meetingCityId", "meetingId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingOperator" ADD CONSTRAINT "MeetingOperator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
