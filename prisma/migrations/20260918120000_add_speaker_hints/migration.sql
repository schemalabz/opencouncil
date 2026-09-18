-- Two independent opinions on who a speaker is, kept on the speaker tag: the
-- voiceprint match from transcribe, and the transcript hint from fixTranscript.
-- personSetBy records which of them, or a reviewer, decided personId, so an
-- automatic pass never overwrites a reviewer.
CREATE TYPE "SpeakerAssignmentSource" AS ENUM ('voiceprint', 'transcript', 'both', 'user');

ALTER TABLE "SpeakerTag" ADD COLUMN     "personSetBy" "SpeakerAssignmentSource",
ADD COLUMN     "transcriptConfidence" DOUBLE PRECISION,
ADD COLUMN     "transcriptPersonId" TEXT,
ADD COLUMN     "voiceprintConfidence" DOUBLE PRECISION,
ADD COLUMN     "voiceprintPersonId" TEXT;

CREATE INDEX "SpeakerTag_voiceprintPersonId_idx" ON "SpeakerTag"("voiceprintPersonId");

CREATE INDEX "SpeakerTag_transcriptPersonId_idx" ON "SpeakerTag"("transcriptPersonId");

ALTER TABLE "SpeakerTag" ADD CONSTRAINT "SpeakerTag_voiceprintPersonId_fkey" FOREIGN KEY ("voiceprintPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SpeakerTag" ADD CONSTRAINT "SpeakerTag_transcriptPersonId_fkey" FOREIGN KEY ("transcriptPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill, so existing meetings are protected by data and not by a code rule
-- alone. Until now only two things wrote a tag: the transcribe import, which
-- creates it, and a reviewer, whose edit moves updatedAt. A few seconds of
-- slack cover the import's own clock.
--
-- 1. An import's voiceprint match nobody touched: the label is still the
--    pipeline's SPEAKER_<n> (the import labels unmatched speakers otherwise),
--    and personId is still the match. The score was never stored.
UPDATE "SpeakerTag"
SET "personSetBy" = 'voiceprint', "voiceprintPersonId" = "personId"
WHERE "personId" IS NOT NULL
  AND "label" ~ '^SPEAKER_[0-9]+$'
  AND "updatedAt" <= "createdAt" + INTERVAL '5 seconds';

-- 2. Everything else that carries a person or was edited is the reviewer's.
--    That errs on the safe side: a tag marked 'user' is never reassigned.
UPDATE "SpeakerTag"
SET "personSetBy" = 'user'
WHERE "personSetBy" IS NULL
  AND ("personId" IS NOT NULL OR "updatedAt" > "createdAt" + INTERVAL '5 seconds');
