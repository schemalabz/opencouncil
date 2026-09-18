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
    "actionable" BOOLEAN NOT NULL,
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
-- creates it and never updates it, and a reviewer. So a tag whose updatedAt
-- moved was edited by a reviewer, and that is the one clue that is exact. A
-- few seconds of slack cover the import's own clock.
--
-- It has to happen in this migration: from this release on, automatic passes
-- update tags too, and updatedAt stops meaning that a reviewer edited one.
--
-- An untouched tag keeps no source. One that carries a person, an import's
-- voiceprint match or a segment a reviewer split off with its person, is
-- protected all the same: a person with no recorded source counts as a
-- reviewer's (see isReviewerAssignment). The voiceprint identifications of
-- existing meetings are not created here. The stored transcribe results still
-- hold them, with their scores, for a later script.
UPDATE "SpeakerTag"
SET "personSetBy" = 'user'
WHERE "updatedAt" > "createdAt" + INTERVAL '5 seconds';
