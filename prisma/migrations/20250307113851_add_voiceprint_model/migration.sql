-- CreateTable
CREATE TABLE "VoicePrint" (
    "id" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "sourceAudioUrl" TEXT NOT NULL,
    "startTimestamp" DOUBLE PRECISION NOT NULL,
    "endTimestamp" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "personId" TEXT NOT NULL,
    "sourceSegmentId" TEXT NOT NULL,

    CONSTRAINT "VoicePrint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoicePrint_personId_idx" ON "VoicePrint"("personId");

-- CreateIndex
CREATE INDEX "VoicePrint_sourceSegmentId_idx" ON "VoicePrint"("sourceSegmentId");

-- AddForeignKey
ALTER TABLE "VoicePrint" ADD CONSTRAINT "VoicePrint_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoicePrint" ADD CONSTRAINT "VoicePrint_sourceSegmentId_fkey" FOREIGN KEY ("sourceSegmentId") REFERENCES "SpeakerSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
