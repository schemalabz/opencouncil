-- PR 3 (notis-inbound): subscriptions created from an inbound message, the
-- Bird conversation handle replies are sent into, and webhook dedupe.

ALTER TYPE "SubscriptionOrigin" ADD VALUE IF NOT EXISTS 'inbound';

ALTER TABLE "NotisSubscription" ADD COLUMN IF NOT EXISTS "birdConversationId" TEXT;

CREATE INDEX IF NOT EXISTS "NotisSubscription_phone_idx" ON "NotisSubscription"("phone");

CREATE UNIQUE INDEX IF NOT EXISTS "NotisMessage_birdMessageId_key" ON "NotisMessage"("birdMessageId");
