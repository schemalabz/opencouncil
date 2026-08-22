-- PR 4 (proactive): settings, editorial-brief cache, scheduled-wake origin,
-- suppressed sends, message channel + cap flag + SMS-fallback link, coalesced
-- wake storage, and the batch-lane coalescing index. Every statement is
-- replay-safe: the integration harness applies the whole history twice.

-- Server-side settings (kill switch, shadow/live mode, poller status).
CREATE TABLE IF NOT EXISTS "NotisSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotisSetting_pkey" PRIMARY KEY ("key")
);

-- The editorial pass runs once per taskId; the brief and its cost live on
-- the dedup log so fan-out and the cost panel read one row.
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "brief" JSONB;
ALTER TABLE "NotisProcessedEvent" ADD COLUMN IF NOT EXISTS "briefCostUsd" DOUBLE PRECISION;

-- Why a scheduled wake exists decides its template shell (followup vs news).
-- Default 'reply' is a factual backfill: PR 3's live lane was the only
-- producer, and every one of its wakes was a user_message wake.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScheduledWakeOrigin') THEN
    CREATE TYPE "ScheduledWakeOrigin" AS ENUM ('reply', 'proactive');
  END IF;
END $$;
ALTER TABLE "NotisScheduledWake" ADD COLUMN IF NOT EXISTS "origin" "ScheduledWakeOrigin" NOT NULL DEFAULT 'reply';

-- A rail (shadow mode, weekly cap, pause, unsubscribed race) stopped the
-- send; the reason lands in failureReason.
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'suppressed';

-- SMS is a notify-only fallback channel; proactive marks cap-countable
-- (unprompted) sends; fallbackForId links an SMS to the failed WhatsApp
-- send it replaces, and its uniqueness makes webhook replays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageChannel') THEN
    CREATE TYPE "MessageChannel" AS ENUM ('whatsapp', 'sms');
  END IF;
END $$;
ALTER TABLE "NotisMessage" ADD COLUMN IF NOT EXISTS "channel" "MessageChannel" NOT NULL DEFAULT 'whatsapp';
ALTER TABLE "NotisMessage" ADD COLUMN IF NOT EXISTS "proactive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NotisMessage" ADD COLUMN IF NOT EXISTS "fallbackForId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "NotisMessage_fallbackForId_key" ON "NotisMessage"("fallbackForId");

-- A coalesced wake consumed several events at once. "event" keeps the
-- primary one (all existing queries stay valid); the full array is stored
-- only when there was more than one.
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "events" JSONB;

-- Batch-lane coalescing: at most one PENDING batch row per subscription.
-- The concurrent-create loser hits 23505 and retries as an append.
CREATE UNIQUE INDEX IF NOT EXISTS "NotisWakeQueue_one_pending_batch_per_sub"
ON "NotisWakeQueue"("subscriptionId")
WHERE status = 'pending'::"QueueItemStatus" AND lane = 'batch'::"QueueLane";
