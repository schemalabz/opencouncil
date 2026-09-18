-- Who decided a speaker tag's person, and what each method says about it.
--
-- personSetBy, on the tag, records who decided personId: a method or a
-- reviewer. An automatic pass never overwrites a reviewer.
--
-- SpeakerIdentification holds one opinion per method and tag: the voiceprint
-- match from transcribe, and the transcript identification from fixTranscript.
-- The opinions are for reviewers, so they live off the tag, which is public.

-- CreateEnum
CREATE TYPE "SpeakerAssignmentSource" AS ENUM ('voiceprint', 'transcript', 'both', 'user');

-- CreateEnum
CREATE TYPE "SpeakerIdentificationMethod" AS ENUM ('voiceprint', 'transcript');

-- AlterTable
ALTER TABLE "SpeakerTag" ADD COLUMN     "personSetBy" "SpeakerAssignmentSource";

-- CreateTable
CREATE TABLE "SpeakerIdentification" (
    "id" TEXT NOT NULL,
    "speakerTagId" TEXT NOT NULL,
    "method" "SpeakerIdentificationMethod" NOT NULL,
    "personId" TEXT NOT NULL,
    "actionable" BOOLEAN NOT NULL DEFAULT true,
    "evidenceKind" TEXT,
    "confidence" DOUBLE PRECISION,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerIdentification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeakerIdentification_personId_idx" ON "SpeakerIdentification"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerIdentification_speakerTagId_method_key" ON "SpeakerIdentification"("speakerTagId", "method");

-- AddForeignKey
ALTER TABLE "SpeakerIdentification" ADD CONSTRAINT "SpeakerIdentification_speakerTagId_fkey" FOREIGN KEY ("speakerTagId") REFERENCES "SpeakerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerIdentification" ADD CONSTRAINT "SpeakerIdentification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill, so existing meetings are protected by data and not by a code rule
-- alone. Until now only two things wrote a tag: the transcribe import, which
-- creates it, and a reviewer, who edits it (moving updatedAt) or splits a
-- segment off into a new tag. A few seconds of slack cover the import's own
-- clock.
--
-- 1. An import's voiceprint match nobody touched: the label is still the
--    pipeline's SPEAKER_<n> (the import labels unmatched speakers otherwise),
--    and personId is still the match. It becomes the tag's voiceprint
--    identification. The score was never stored.
--
--    The tag must also date from the import. "Change this segment only" in the
--    speaker picker makes a new tag in one write, with the reviewer's person
--    and the label of the tag it was split from: untouched, labelled
--    SPEAKER_<n>, and a reviewer's. The import creates every tag of a meeting
--    in one transaction, so its tags share the meeting's earliest createdAt and
--    a split-off tag is later. A tag no segment uses belongs to no meeting and
--    falls through to step 2.
WITH tag_meeting AS (
    SELECT DISTINCT "speakerTagId" AS id, "cityId", "meetingId" FROM "SpeakerSegment"
), meeting_import AS (
    SELECT tm."cityId", tm."meetingId", min(t."createdAt") AS "importedAt"
    FROM tag_meeting tm
    JOIN "SpeakerTag" t ON t.id = tm.id
    GROUP BY tm."cityId", tm."meetingId"
), matched AS (
    UPDATE "SpeakerTag" t
    SET "personSetBy" = 'voiceprint'
    FROM tag_meeting tm
    JOIN meeting_import mi ON mi."cityId" = tm."cityId" AND mi."meetingId" = tm."meetingId"
    WHERE tm.id = t.id
      AND t."personId" IS NOT NULL
      AND t."label" ~ '^SPEAKER_[0-9]+$'
      AND t."updatedAt" <= t."createdAt" + INTERVAL '5 seconds'
      AND t."createdAt" <= mi."importedAt" + INTERVAL '1 minute'
    RETURNING t.id, t."personId"
)
INSERT INTO "SpeakerIdentification" ("id", "speakerTagId", "method", "personId", "updatedAt")
SELECT gen_random_uuid()::text, id, 'voiceprint'::"SpeakerIdentificationMethod", "personId", CURRENT_TIMESTAMP
FROM matched;

-- 2. Everything else that carries a person or was edited is the reviewer's.
--    That errs on the safe side: a tag marked 'user' is never reassigned.
UPDATE "SpeakerTag"
SET "personSetBy" = 'user'
WHERE "personSetBy" IS NULL
  AND ("personId" IS NOT NULL OR "updatedAt" > "createdAt" + INTERVAL '5 seconds');
