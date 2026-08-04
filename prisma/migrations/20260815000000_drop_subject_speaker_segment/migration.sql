/*
  Warnings:

  - You are about to drop the `SubjectSpeakerSegment` table. If the table is not empty, all the data it contains will be lost.

*/
-- PREREQUISITE: apply elasticsearch/views.sql to the target database before this migration.
--
-- Two PGSync views read this table. SubjectSpeakerSegmentSearchView goes away with it and the
-- statement below removes it. SubjectMetricsView survives and keeps reading the table for a
-- legacy fallback until views.sql replaces its definition, and Postgres blocks DROP TABLE while
-- any view still reads the table.
--
-- Preview and staging carry no PGSync views, so this migration passes there whether or not the
-- prerequisite ran. Production carries them. See issue #638.

-- Drop the PGSync helper view that depends on the table (see elasticsearch/views.sql)
DROP VIEW IF EXISTS "SubjectSpeakerSegmentSearchView";

-- DropForeignKey
ALTER TABLE "SubjectSpeakerSegment" DROP CONSTRAINT "SubjectSpeakerSegment_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectSpeakerSegment" DROP CONSTRAINT "SubjectSpeakerSegment_speakerSegmentId_fkey";

-- DropTable
DROP TABLE "SubjectSpeakerSegment";
