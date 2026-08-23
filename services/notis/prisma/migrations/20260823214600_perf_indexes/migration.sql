-- Perf indexes (cross-session review, finding 13). Replay-safe: the
-- integration harness applies migrations twice.

-- Panel aggregates, the overview series, and cap counting all scan
-- messages by time across subscriptions.
CREATE INDEX IF NOT EXISTS "NotisMessage_createdAt_idx" ON "NotisMessage"("createdAt");

-- The sweeper polls for stale pending outbound every minute. The partial
-- stays tiny (pending rows drain within seconds) while the table grows
-- with every message ever sent.
CREATE INDEX IF NOT EXISTS "NotisMessage_pending_outbound_idx"
  ON "NotisMessage" ("createdAt")
  WHERE status = 'pending'::"MessageStatus" AND direction = 'outbound'::"MessageDirection";

-- The poller fires due scheduled wakes each tick; un-fired rows are the
-- entire working set.
CREATE INDEX IF NOT EXISTS "NotisScheduledWake_unfired_idx"
  ON "NotisScheduledWake" ("runAfter")
  WHERE "firedAt" IS NULL;

-- The system page counts wakes per meeting through event->>'meetingId'.
CREATE INDEX IF NOT EXISTS "NotisWake_event_meeting_idx"
  ON "NotisWake" ((event->>'meetingId'));
