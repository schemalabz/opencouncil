-- Migrate existing claims into DecisionCandidate rows (issue #617 phase 4):
-- a claim becomes an unresolved candidate proposing the claiming subject; the
-- conflict stays derivable via the ADA join to the holding Decision.
INSERT INTO "DecisionCandidate" ("id", "cityId", "ada", "pdfUrl", "readStatus", "councilMeetingId", "subjectId", "createdAt", "updatedAt")
SELECT DISTINCT ON (s."cityId", s."claimedAda")
       gen_random_uuid(), s."cityId", s."claimedAda",
       'https://diavgeia.gov.gr/doc/' || s."claimedAda",
       'unread', s."councilMeetingId", s.id, NOW(), NOW()
FROM "Subject" s
WHERE s."claimedAda" IS NOT NULL
-- A poll may already have created a candidate row for this ADA (deploys are
-- order-free). Keep that row, but carry the claim over as its proposed subject
-- when the row is still unresolved and has no proposal of its own — otherwise
-- the claiming subject's association would be lost with the column drop.
ON CONFLICT ("cityId", "ada") DO UPDATE SET "subjectId" = EXCLUDED."subjectId"
WHERE "DecisionCandidate"."decisionId" IS NULL
  AND "DecisionCandidate"."dismissedAt" IS NULL
  AND "DecisionCandidate"."subjectId" IS NULL;

-- AlterTable
ALTER TABLE "Subject" DROP COLUMN "claimedAda";
