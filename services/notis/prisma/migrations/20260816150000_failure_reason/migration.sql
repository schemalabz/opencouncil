-- Store WHY an outbound delivery failed (Bird error text or the webhook's
-- failure description), for the overview's failure breakdown.

ALTER TABLE "NotisMessage" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
