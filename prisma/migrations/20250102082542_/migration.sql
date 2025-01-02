/*
  Warnings:

  - You are about to drop the column `icon` on the `SpeakerSegment` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "SubjectSpeakerSegment_subjectId_speakerSegmentId_idx";

-- AlterTable
ALTER TABLE "SpeakerSegment" DROP COLUMN "icon";
