-- CreateEnum
CREATE TYPE "SpeakerSegmentType" AS ENUM ('procedural', 'substantive');

-- AlterTable
ALTER TABLE "Summary" ADD COLUMN     "type" "SpeakerSegmentType";
