-- DropIndex
DROP INDEX "TopicLabel_speakerSegmentId_idx";

-- CreateIndex
CREATE INDEX "TopicLabel_speakerSegmentId_topicId_idx" ON "TopicLabel"("speakerSegmentId", "topicId");
