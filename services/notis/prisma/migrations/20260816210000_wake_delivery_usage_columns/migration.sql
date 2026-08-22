-- Promote NotisWake.delivery and NotisWake.usage from json to columns.
-- Both are small closed shapes that the service owns; columns make them
-- queryable (template share, token dashboards) and match NotisMessage,
-- which already stores deliveryMode/template as columns.
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "deliveryMode" "MessageDeliveryMode";
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "deliveryTemplate" TEXT;
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "cacheReadTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "cacheWrite1hTokens" INTEGER;

-- Backfill from the json columns, then drop them. Guarded so a replay on an
-- already-converted database is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'NotisWake' AND column_name = 'delivery'
  ) THEN
    UPDATE "NotisWake" SET
      "deliveryMode" = ("delivery"->>'mode')::"MessageDeliveryMode",
      "deliveryTemplate" = "delivery"->>'template'
    WHERE "delivery" IS NOT NULL;
    ALTER TABLE "NotisWake" DROP COLUMN "delivery";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'NotisWake' AND column_name = 'usage'
  ) THEN
    UPDATE "NotisWake" SET
      "inputTokens" = COALESCE(("usage"->>'input')::int, 0),
      "outputTokens" = COALESCE(("usage"->>'output')::int, 0),
      "cacheReadTokens" = COALESCE(("usage"->>'cacheRead')::int, 0),
      "cacheWriteTokens" = COALESCE(("usage"->>'cacheWrite')::int, 0),
      "cacheWrite1hTokens" = ("usage"->>'cacheWrite1h')::int;
    ALTER TABLE "NotisWake" DROP COLUMN "usage";
  END IF;
END $$;
