-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "SpeakerSegment" ADD COLUMN     "embedding" vector;
