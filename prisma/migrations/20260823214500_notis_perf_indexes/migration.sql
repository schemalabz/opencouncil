-- Perf indexes for the notis integration paths (cross-session review,
-- finding 13). Replay-safe: IF NOT EXISTS throughout.

-- Every WhatsApp webhook event resolves its sender by phone on BOTH apps'
-- gates (the main app's notis-served check and notis's own lookup) —
-- without an index each event seq-scans "User".
CREATE INDEX IF NOT EXISTS "User_phone_idx" ON "User"("phone");

-- The notis poller's meeting-event feed reads succeeded pipeline tasks by
-- recency through the notis_meeting_events view; the partial keeps the
-- per-tick scan off the full TaskStatus history.
CREATE INDEX IF NOT EXISTS "TaskStatus_notis_events_idx"
  ON "TaskStatus" ("updatedAt")
  WHERE type IN ('processAgenda', 'summarize') AND status = 'succeeded';
