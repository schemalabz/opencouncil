-- The documents a body's back office receives by email (#874): one setting per
-- body and document, one record per send, and the subjects a provisional send
-- named as missing. The transcript moves onto both: the contactEmails of a body
-- become its enabled transcript setting, and each recorded transcriptSent task
-- becomes a sent row. The column is dropped in the same step, so the settings
-- table is the one source of recipients from the first deploy. The
-- transcriptSent rows stay in TaskStatus.
BEGIN;

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('transcript', 'minutes');

-- CreateEnum
CREATE TYPE "DocumentSendStatus" AS ENUM ('pending', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "DocumentSendTrigger" AS ENUM ('review', 'complete', 'threshold', 'manual');

-- CreateTable
CREATE TABLE "DocumentSendSetting" (
    "id" TEXT NOT NULL,
    "administrativeBodyId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "kind" "DocumentKind" NOT NULL,
    "status" "DocumentSendStatus" NOT NULL DEFAULT 'pending',
    "trigger" "DocumentSendTrigger" NOT NULL,
    "recipientEmails" TEXT[],
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSendMissingSubject" (
    "id" TEXT NOT NULL,
    "documentSendId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSendMissingSubject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSendSetting_administrativeBodyId_kind_key" ON "DocumentSendSetting"("administrativeBodyId", "kind");

-- CreateIndex
CREATE INDEX "DocumentSend_cityId_councilMeetingId_idx" ON "DocumentSend"("cityId", "councilMeetingId");

-- CreateIndex
CREATE INDEX "DocumentSend_status_createdAt_idx" ON "DocumentSend"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentSendMissingSubject_subjectId_idx" ON "DocumentSendMissingSubject"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSendMissingSubject_documentSendId_subjectId_key" ON "DocumentSendMissingSubject"("documentSendId", "subjectId");

-- One automatic send per meeting and document that is not failed. The sender
-- inserts a pending row before it renders anything, so the second of two
-- concurrent senders fails here and sends nothing. A failed row leaves the
-- slot free for a retry. A manual send may repeat.
-- Written by hand: Prisma has no partial unique index (precedent: Administers_claimed_person_key).
CREATE UNIQUE INDEX "DocumentSend_automatic_key" ON "DocumentSend"("cityId", "councilMeetingId", "kind") WHERE "trigger" <> 'manual' AND "status" <> 'failed';

-- AddForeignKey
ALTER TABLE "DocumentSendSetting" ADD CONSTRAINT "DocumentSendSetting_administrativeBodyId_fkey" FOREIGN KEY ("administrativeBodyId") REFERENCES "AdministrativeBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSend" ADD CONSTRAINT "DocumentSend_cityId_councilMeetingId_fkey" FOREIGN KEY ("cityId", "councilMeetingId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSend" ADD CONSTRAINT "DocumentSend_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSendMissingSubject" ADD CONSTRAINT "DocumentSendMissingSubject_documentSendId_fkey" FOREIGN KEY ("documentSendId") REFERENCES "DocumentSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSendMissingSubject" ADD CONSTRAINT "DocumentSendMissingSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every body with contact emails gets an enabled transcript setting
-- with the same addresses, in the same order (the first is To, the rest CC).
-- enabledAt is now: the transcript goes out when a reviewer ticks it, so its
-- switch-on gates nothing.
INSERT INTO "DocumentSendSetting" ("id", "administrativeBodyId", "kind", "enabled", "enabledAt", "recipientEmails", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."id", 'transcript', true, NOW(), b."contactEmails", NOW(), NOW()
FROM "AdministrativeBody" b
WHERE cardinality(b."contactEmails") > 0;

-- Backfill: one sent row per recorded transcriptSent task, with the recipients
-- the task stored in its requestBody. The first send of a meeting takes the
-- automatic slot of the unique index above; a later send of the same meeting
-- was a resend by hand, so it is recorded as manual.
INSERT INTO "DocumentSend" ("id", "councilMeetingId", "cityId", "kind", "status", "trigger", "recipientEmails", "sentAt", "createdAt", "updatedAt")
SELECT t."id", t."councilMeetingId", t."cityId", 'transcript', 'sent',
       CASE WHEN t.rank = 1 THEN 'review'::"DocumentSendTrigger" ELSE 'manual'::"DocumentSendTrigger" END,
       -- A requestBody that is not JSON, or holds no recipient array, gives an
       -- empty list instead of failing the migration.
       CASE WHEN pg_input_is_valid(t."requestBody", 'jsonb')
                 AND jsonb_typeof(t."requestBody"::jsonb -> 'recipientEmails') = 'array'
            THEN COALESCE(
                (SELECT array_agg(e ORDER BY ord) FROM jsonb_array_elements_text(t."requestBody"::jsonb -> 'recipientEmails') WITH ORDINALITY AS r(e, ord)),
                ARRAY[]::TEXT[])
            ELSE ARRAY[]::TEXT[]
       END,
       t."createdAt", t."createdAt", t."updatedAt"
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY "cityId", "councilMeetingId" ORDER BY "createdAt", "id") AS rank
    FROM "TaskStatus"
    WHERE "type" = 'transcriptSent' AND "status" = 'succeeded'
) t;

-- AlterTable
ALTER TABLE "AdministrativeBody" DROP COLUMN "contactEmails";

COMMIT;
