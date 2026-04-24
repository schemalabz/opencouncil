-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN "notifyByEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "notifyByPhone" BOOLEAN NOT NULL DEFAULT true;
