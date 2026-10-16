-- Correct a backfilled transcript from the municipality's own minutes (#876):
-- the document on the meeting, the task run behind each task edit, and the
-- minutes as a third speaker identification method.

-- AlterEnum
ALTER TYPE "SpeakerAssignmentSource" ADD VALUE 'minutes';

-- AlterEnum
ALTER TYPE "SpeakerIdentificationMethod" ADD VALUE 'minutes';

-- AlterTable
ALTER TABLE "CouncilMeeting" ADD COLUMN     "municipalMinutesUrl" TEXT;

-- AlterTable
ALTER TABLE "UtteranceEdit" ADD COLUMN     "taskId" TEXT;

-- CreateIndex
CREATE INDEX "UtteranceEdit_taskId_idx" ON "UtteranceEdit"("taskId");

-- AddForeignKey
ALTER TABLE "UtteranceEdit" ADD CONSTRAINT "UtteranceEdit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
