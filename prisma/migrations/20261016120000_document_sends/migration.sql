-- The documents a body's back office receives by email (#874): one setting per
-- body and document, and one record per send. The transcript moves onto both:
-- the contactEmails of a body become its enabled transcript setting, and each
-- recorded transcriptSent task becomes a sent row. The column is dropped in the
-- same step, so the settings table is the one source of recipients from the
-- first deploy. The transcriptSent rows stay in TaskStatus.
BEGIN;

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('transcript', 'minutes');

-- CreateEnum
CREATE TYPE "DocumentSendStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "DocumentSendTrigger" AS ENUM ('review', 'complete', 'threshold', 'manual');

-- CreateTable
CREATE TABLE "DocumentSendSetting" (
    "id" TEXT NOT NULL,
    "administrativeBodyId" TEXT NOT NULL,
    "document" "DocumentKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "recipientEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSendSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSend" (
    "id" TEXT NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "document" "DocumentKind" NOT NULL,
    "status" "DocumentSendStatus" NOT NULL DEFAULT 'pending',
    "trigger" "DocumentSendTrigger" NOT NULL,
    "automatic" BOOLEAN NOT NULL,
    "recipientEmails" TEXT[],
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "missingSubjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSendSetting_administrativeBodyId_document_key" ON "DocumentSendSetting"("administrativeBodyId", "document");

-- CreateIndex
CREATE INDEX "DocumentSend_cityId_councilMeetingId_idx" ON "DocumentSend"("cityId", "councilMeetingId");

-- CreateIndex
CREATE INDEX "DocumentSend_status_createdAt_idx" ON "DocumentSend"("status", "createdAt");

-- One automatic send per meeting and document that is not failed. The sender
-- inserts a pending row before it renders anything, so the second of two
-- concurrent senders fails here and sends nothing. A failed row leaves the
-- slot free for a retry. A manual send (automatic = false) may repeat.
-- Written by hand: Prisma has no partial unique index (precedent: Administers_claimed_person_key).
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentSend_automatic_key" ON "DocumentSend"("cityId", "councilMeetingId", "document") WHERE "automatic" AND "status" <> 'failed';

-- AddForeignKey
ALTER TABLE "DocumentSendSetting" ADD CONSTRAINT "DocumentSendSetting_administrativeBodyId_fkey" FOREIGN KEY ("administrativeBodyId") REFERENCES "AdministrativeBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSend" ADD CONSTRAINT "DocumentSend_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting"("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every body with contact emails gets an enabled transcript setting
-- with the same addresses, in the same order (the first is To, the rest CC).
-- enabledAt stays null: the contact emails applied to every meeting, and the
-- transcript of a meeting reviewed after this deploy must still go out.
INSERT INTO "DocumentSendSetting" ("id", "administrativeBodyId", "document", "enabled", "enabledAt", "recipientEmails", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."id", 'transcript', true, NULL, b."contactEmails", NOW(), NOW()
FROM "AdministrativeBody" b
WHERE cardinality(b."contactEmails") > 0;

-- Backfill: one sent row per recorded transcriptSent task, with the recipients
-- the task stored in its requestBody. The first send of a meeting takes the
-- automatic slot of the unique index above; a later send of the same meeting
-- was a resend by hand, so it is recorded as manual.
INSERT INTO "DocumentSend" ("id", "councilMeetingId", "cityId", "document", "status", "trigger", "automatic", "recipientEmails", "complete", "missingSubjectIds", "sentAt", "createdAt", "updatedAt")
SELECT t."id", t."councilMeetingId", t."cityId", 'transcript', 'sent',
       CASE WHEN t.rank = 1 THEN 'review'::"DocumentSendTrigger" ELSE 'manual'::"DocumentSendTrigger" END,
       t.rank = 1,
       COALESCE(
           (SELECT array_agg(e ORDER BY ord) FROM jsonb_array_elements_text(t."requestBody"::jsonb -> 'recipientEmails') WITH ORDINALITY AS r(e, ord)),
           ARRAY[]::TEXT[]
       ),
       true, ARRAY[]::TEXT[], t."createdAt", t."createdAt", t."updatedAt"
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY "cityId", "councilMeetingId" ORDER BY "createdAt", "id") AS rank
    FROM "TaskStatus"
    WHERE "type" = 'transcriptSent' AND "status" = 'succeeded'
) t;

-- AlterTable
ALTER TABLE "AdministrativeBody" DROP COLUMN "contactEmails";

COMMIT;
