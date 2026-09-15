-- The WhatsApp/SMS consent moved to the person (User.notifyByPhone, migration
-- 20260906210000). No build reads the per-municipality column any more.
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "notifyByPhone";
