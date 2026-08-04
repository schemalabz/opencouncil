/*
  Warnings:

  - You are about to drop the `SubjectSpeakerSegment` table. If the table is not empty, all the data it contains will be lost.

*/
-- Drop the PGSync helper view that depends on the table (see elasticsearch/views.sql)
DROP VIEW IF EXISTS "SubjectSpeakerSegmentSearchView";

-- DropForeignKey
ALTER TABLE "SubjectSpeakerSegment" DROP CONSTRAINT "SubjectSpeakerSegment_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectSpeakerSegment" DROP CONSTRAINT "SubjectSpeakerSegment_speakerSegmentId_fkey";

-- DropTable
DROP TABLE "SubjectSpeakerSegment";
