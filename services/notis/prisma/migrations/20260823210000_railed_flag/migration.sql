-- The delivery-instant rail flag, stamped per row instead of derived per
-- call site. Backfill approximates history: every proactive or template
-- row was railed; reply-continuation freeform rows before this flag are
-- all delivered already, so their value no longer matters.
ALTER TABLE "NotisMessage" ADD COLUMN IF NOT EXISTS "railed" BOOLEAN NOT NULL DEFAULT false;
UPDATE "NotisMessage" SET "railed" = true WHERE "proactive" = true OR "deliveryMode" = 'template';
