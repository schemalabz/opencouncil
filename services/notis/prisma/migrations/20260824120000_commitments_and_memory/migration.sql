-- Two durable memories the agent did not have.
--
-- 1. Commitments. Three launch-week conversations show the agent promising a
--    follow-up («Το κρατάω», «θα σε ενημερώσω αν προχωρήσουν αυτά») and
--    recording it nowhere. The promise survived only inside one wake
--    rationale, and the decision log renders the newest 30 entries — one
--    reader spent 27 of them in fourteen hours.
--
--    This is not a return of NotisJournalEntry (retired in
--    20260823130000_journal_to_decision_log). That table was a parallel
--    narrative of what the message and wake rows already held. A promise is
--    state that exists nowhere else, with a lifecycle the shell can enforce.
--
-- 2. Memory. Everything older than the two live windows (30 decisions, 40
--    messages) is simply gone. The compaction pass folds it into one running
--    narrative; `memoryThrough` marks how far that narrative reaches, so the
--    summary and the live windows never overlap.
--
-- Replay-safe throughout: the integration harness applies migrations twice.

ALTER TABLE "NotisSubscription" ADD COLUMN IF NOT EXISTS "memory" TEXT;
ALTER TABLE "NotisSubscription" ADD COLUMN IF NOT EXISTS "memoryThrough" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "NotisCommitment" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "what"           TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"     TIMESTAMP(3),
  CONSTRAINT "NotisCommitment_pkey" PRIMARY KEY ("id")
);

-- One live handle per reader: record_commitment upserts on it, and
-- resolve_commitment addresses a promise by name rather than by position.
CREATE UNIQUE INDEX IF NOT EXISTS "NotisCommitment_subscriptionId_slug_key"
  ON "NotisCommitment" ("subscriptionId", "slug");

-- The open-commitments read on every wake, and the janitor's expiry sweep.
CREATE INDEX IF NOT EXISTS "NotisCommitment_subscriptionId_resolvedAt_idx"
  ON "NotisCommitment" ("subscriptionId", "resolvedAt");

-- Cascade: the janitor's orphan purge deletes subscriptions with a bare
-- deleteMany and would fail on a restricting foreign key.
DO $$
BEGIN
  ALTER TABLE "NotisCommitment"
    ADD CONSTRAINT "NotisCommitment_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "NotisSubscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
