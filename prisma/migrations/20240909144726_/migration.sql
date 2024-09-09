-- CreateTable
CREATE TABLE "TopicLabel" (
    "id" TEXT NOT NULL,
    "speakerSegmentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summary" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "speakerSegmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Summary_speakerSegmentId_key" ON "Summary"("speakerSegmentId");

-- AddForeignKey
ALTER TABLE "TopicLabel" ADD CONSTRAINT "TopicLabel_speakerSegmentId_fkey" FOREIGN KEY ("speakerSegmentId") REFERENCES "SpeakerSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicLabel" ADD CONSTRAINT "TopicLabel_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_speakerSegmentId_fkey" FOREIGN KEY ("speakerSegmentId") REFERENCES "SpeakerSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
