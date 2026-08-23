-- The dedup identity moves from the task to the meeting and its phase.
-- Re-processing a meeting writes a new TaskStatus row; keying the log on it
-- would fan the same agenda or the same summary out a second time, and a
-- WhatsApp message cannot be recalled. A failed task never recorded a row
-- here, so its retry is still the first success and still fires.
--
-- Replayable: the integration harness executes this file twice.

-- Later rows for the same meeting and phase ARE the re-processing this key
-- exists to ignore; the earliest one is the record.
DELETE FROM "NotisProcessedEvent" a
USING "NotisProcessedEvent" b
WHERE a."cityId" = b."cityId"
  AND a."meetingId" = b."meetingId"
  AND a.type = b.type
  AND (a."processedAt", a.ctid) > (b."processedAt", b.ctid);

ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "id" TEXT;
UPDATE "NotisProcessedEvent" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "NotisProcessedEvent" ALTER COLUMN "id" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'NotisProcessedEvent_pkey' AND conkey <> ARRAY[
      (SELECT attnum FROM pg_attribute
       WHERE attrelid = '"NotisProcessedEvent"'::regclass AND attname = 'id')
    ]
  ) THEN
    ALTER TABLE "NotisProcessedEvent" DROP CONSTRAINT "NotisProcessedEvent_pkey";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotisProcessedEvent_pkey'
  ) THEN
    ALTER TABLE "NotisProcessedEvent" ADD CONSTRAINT "NotisProcessedEvent_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "NotisProcessedEvent_cityId_meetingId_type_key"
  ON "NotisProcessedEvent"("cityId", "meetingId", "type");
CREATE INDEX IF NOT EXISTS "NotisProcessedEvent_taskId_idx"
  ON "NotisProcessedEvent"("taskId");
