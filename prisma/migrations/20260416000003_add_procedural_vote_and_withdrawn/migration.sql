-- AlterEnum
ALTER TYPE "DiscussionStatus" ADD VALUE 'PROCEDURAL_VOTE';

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN "withdrawn" BOOLEAN NOT NULL DEFAULT false;
