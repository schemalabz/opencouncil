-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "proximityImportance" TEXT,
ADD COLUMN     "topicImportance" TEXT;

-- CreateTable
CREATE TABLE "SpeakerContribution" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "speakerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeakerContribution_subjectId_idx" ON "SpeakerContribution"("subjectId");

-- CreateIndex
CREATE INDEX "SpeakerContribution_speakerId_idx" ON "SpeakerContribution"("speakerId");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerContribution_subjectId_speakerId_key" ON "SpeakerContribution"("subjectId", "speakerId");

-- AddForeignKey
ALTER TABLE "SpeakerContribution" ADD CONSTRAINT "SpeakerContribution_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerContribution" ADD CONSTRAINT "SpeakerContribution_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
