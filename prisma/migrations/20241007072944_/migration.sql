-- AlterTable
ALTER TABLE "Highlight" ADD COLUMN     "subjectId" TEXT;

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectSpeakerSegment" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "speakerSegmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectSpeakerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectSpeakerSegment_subjectId_speakerSegmentId_idx" ON "SubjectSpeakerSegment"("subjectId", "speakerSegmentId");

-- AddForeignKey
ALTER TABLE "SubjectSpeakerSegment" ADD CONSTRAINT "SubjectSpeakerSegment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectSpeakerSegment" ADD CONSTRAINT "SubjectSpeakerSegment_speakerSegmentId_fkey" FOREIGN KEY ("speakerSegmentId") REFERENCES "SpeakerSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
