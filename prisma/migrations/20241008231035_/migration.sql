-- CreateEnum
CREATE TYPE "PodcastPartType" AS ENUM ('HOST', 'AUDIO');

-- CreateTable
CREATE TABLE "PodcastSpec" (
    "id" TEXT NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PodcastSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastPart" (
    "id" TEXT NOT NULL,
    "type" "PodcastPartType" NOT NULL,
    "text" TEXT,
    "audioSegmentUrl" TEXT,
    "duration" DOUBLE PRECISION,
    "startTimestamp" DOUBLE PRECISION,
    "endTimestamp" DOUBLE PRECISION,
    "podcastSpecId" TEXT NOT NULL,

    CONSTRAINT "PodcastPart_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PodcastSpec" ADD CONSTRAINT "PodcastSpec_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting"("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastPart" ADD CONSTRAINT "PodcastPart_podcastSpecId_fkey" FOREIGN KEY ("podcastSpecId") REFERENCES "PodcastSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;
