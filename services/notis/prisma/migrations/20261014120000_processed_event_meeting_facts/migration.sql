-- The main view notis_meeting_events now carries the facts of a meeting: the
-- kind, the urgency, the session number and the legacy stored name
-- (meetingName, null for new meetings). Notis derives the title from them
-- with the shared code (@opencouncil/ui/lib/meeting-title), so the ledger
-- keeps them too. A meeting without a kind falls back to the stored name.
-- Nullable: rows recorded before have no facts, and their meetingName is the
-- stored name of the meeting.
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "meetingKind" TEXT;
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "urgent" BOOLEAN;
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "sessionNumber" INTEGER;
