-- DropIndex
DROP INDEX "SpeakerSegment_meetingId_cityId_idx";

-- DropIndex
DROP INDEX "Utterance_speakerSegmentId_idx";

-- DropIndex
DROP INDEX "Word_utteranceId_idx";

-- CreateIndex
CREATE INDEX "SpeakerSegment_meetingId_cityId_startTimestamp_idx" ON "SpeakerSegment"("meetingId", "cityId", "startTimestamp");

-- CreateIndex
CREATE INDEX "TopicLabel_speakerSegmentId_idx" ON "TopicLabel"("speakerSegmentId");

-- CreateIndex
CREATE INDEX "Utterance_speakerSegmentId_startTimestamp_idx" ON "Utterance"("speakerSegmentId", "startTimestamp");

-- CreateIndex
CREATE INDEX "Word_utteranceId_startTimestamp_idx" ON "Word"("utteranceId", "startTimestamp");
