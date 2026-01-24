-- CreateEnum
CREATE TYPE "DiscussionStatus" AS ENUM ('ATTENDANCE', 'SUBJECT_DISCUSSION', 'VOTE', 'OTHER');

-- AlterTable
ALTER TABLE "Utterance" ADD COLUMN     "discussionStatus" "DiscussionStatus",
ADD COLUMN     "discussionSubjectId" TEXT;

-- AddForeignKey
ALTER TABLE "Utterance" ADD CONSTRAINT "Utterance_discussionSubjectId_fkey" FOREIGN KEY ("discussionSubjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
