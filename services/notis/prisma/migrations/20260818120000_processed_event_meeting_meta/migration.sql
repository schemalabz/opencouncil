-- The editorial ledger shows which meeting a brief covered; the poller has
-- the view row in hand when it records the event, so keep the display
-- metadata with it. Nullable: pre-existing rows have none.
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "meetingName" TEXT;
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "meetingDate" TIMESTAMP(3);
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "adminBodyName" TEXT;
