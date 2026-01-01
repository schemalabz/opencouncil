-- CreateEnum
CREATE TYPE "CityStatus" AS ENUM ('pending', 'unlisted', 'listed');

-- AlterTable: Add status column (nullable initially for data migration)
ALTER TABLE "City" ADD COLUMN "status" "CityStatus";

-- Migrate existing data
-- isPending = true → status = 'pending'
UPDATE "City" SET "status" = 'pending' WHERE "isPending" = true;

-- isPending = false AND isListed = false → status = 'unlisted'
UPDATE "City" SET "status" = 'unlisted' WHERE "isPending" = false AND "isListed" = false;

-- isPending = false AND isListed = true → status = 'listed'
UPDATE "City" SET "status" = 'listed' WHERE "isPending" = false AND "isListed" = true;

-- Set default for any NULL values (shouldn't happen, but safety)
UPDATE "City" SET "status" = 'pending' WHERE "status" IS NULL;

-- Drop old index
DROP INDEX IF EXISTS "City_isPending_isListed_idx";

-- Make status NOT NULL and set default
ALTER TABLE "City" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "City" ALTER COLUMN "status" SET DEFAULT 'pending';

-- Drop old columns
ALTER TABLE "City" DROP COLUMN "isPending";
ALTER TABLE "City" DROP COLUMN "isListed";

-- CreateIndex
CREATE INDEX "City_status_idx" ON "City"("status");
