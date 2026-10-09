-- The main view notis_meeting_events now carries the facts of a meeting: the
-- name override (meetingName, null when the title is derived), the kind and
-- the session number. Notis derives the title from them with the shared code
-- (@opencouncil/ui/lib/meeting-title), so the ledger keeps them too.
-- Nullable: rows recorded before have none, and their meetingName is the
-- stored name of the meeting.
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "meetingKind" TEXT;
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "sessionNumber" INTEGER;
