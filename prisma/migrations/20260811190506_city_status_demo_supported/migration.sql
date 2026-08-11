-- Collapse City.status (pending|unlisted|listed) and City.officialSupport into a
-- single CityStatus (pending|demo|supported).
--
-- Postgres cannot drop values from an enum in place, so this is the usual
-- create-swap-drop rather than an ALTER TYPE.

-- CreateEnum
CREATE TYPE "CityStatus_new" AS ENUM ('pending', 'demo', 'supported');

-- AlterTable: add nullable first, so the backfill runs before any constraint.
ALTER TABLE "City" ADD COLUMN "status_new" "CityStatus_new";

-- Migrate existing data.
-- officialSupport = true -> 'supported' (a customer city: published and badged).
UPDATE "City" SET "status_new" = 'supported' WHERE "officialSupport" = true;

-- Everything else -> 'pending'. DELIBERATE AND LOSSY: 'unlisted' folds into
-- 'pending', and today's (status = 'listed', officialSupport = false) cities stop
-- being published. Nothing is promoted to 'demo' here — that is set by hand
-- afterwards, one city per realm. There is no reverse migration.
UPDATE "City" SET "status_new" = 'pending' WHERE "officialSupport" = false;

-- Safety net: officialSupport is NOT NULL, so this should be a no-op, but the
-- previous consolidation (20251208201529) carried the same belt-and-braces.
UPDATE "City" SET "status_new" = 'pending' WHERE "status_new" IS NULL;

-- Drop the index before the column it covers.
DROP INDEX IF EXISTS "City_status_idx";

-- Swap the columns.
ALTER TABLE "City" DROP COLUMN "status";
ALTER TABLE "City" DROP COLUMN "officialSupport";
ALTER TABLE "City" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "City" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "City" ALTER COLUMN "status" SET DEFAULT 'pending';

-- Swap the type name, so the type Prisma looks for is the one that survives.
-- The DROP only succeeds because City.status was the sole user and was dropped
-- two statements ago.
DROP TYPE "CityStatus";
ALTER TYPE "CityStatus_new" RENAME TO "CityStatus";

-- CreateIndex
CREATE INDEX "City_status_idx" ON "City"("status");
