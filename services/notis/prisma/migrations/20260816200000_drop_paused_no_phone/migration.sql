-- Collapse SubscriptionStatus to two states: active, unsubscribed.
-- "Phone removed" and "phone notifications unchecked" are unsubscribes, not
-- a separate pause — the profile checkbox is the single subscription control.
-- Postgres cannot drop an enum value, so swap the type. No row can hold
-- 'paused_no_phone' (no code ever wrote it), so the cast is safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'paused_no_phone'
  ) THEN
    ALTER TYPE "SubscriptionStatus" RENAME TO "SubscriptionStatus_old";
    CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'unsubscribed');
    ALTER TABLE "NotisSubscription" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "NotisSubscription"
      ALTER COLUMN "status" TYPE "SubscriptionStatus"
      USING ("status"::text::"SubscriptionStatus");
    ALTER TABLE "NotisSubscription" ALTER COLUMN "status" SET DEFAULT 'active';
    DROP TYPE "SubscriptionStatus_old";
  END IF;
END $$;
