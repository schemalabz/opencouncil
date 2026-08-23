/*
  Warnings:

  - You are about to drop the `PodcastSpec` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PodcastPart` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PodcastPartAudioUtterance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PodcastPartType` enum.

*/
-- OpenCouncil no longer supports podcasts. This migration removes the schema behind the feature.
--
-- No PGSync view reads these tables (see elasticsearch/views.sql), so no view has to go first.

-- DropForeignKey
ALTER TABLE "PodcastSpec" DROP CONSTRAINT "PodcastSpec_councilMeetingId_cityId_fkey";

-- DropForeignKey
ALTER TABLE "PodcastPart" DROP CONSTRAINT "PodcastPart_podcastSpecId_fkey";

-- DropForeignKey
ALTER TABLE "PodcastPartAudioUtterance" DROP CONSTRAINT "PodcastPartAudioUtterance_podcastPartId_fkey";

-- DropForeignKey
ALTER TABLE "PodcastPartAudioUtterance" DROP CONSTRAINT "PodcastPartAudioUtterance_utteranceId_fkey";

-- DropTable
DROP TABLE "PodcastPartAudioUtterance";

-- DropTable
DROP TABLE "PodcastPart";

-- DropTable
DROP TABLE "PodcastSpec";

-- DropEnum
DROP TYPE "PodcastPartType";
