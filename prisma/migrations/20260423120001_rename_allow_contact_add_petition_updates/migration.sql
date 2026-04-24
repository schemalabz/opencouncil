-- AlterTable
ALTER TABLE "User" RENAME COLUMN "allowContact" TO "allowProductUpdates";
ALTER TABLE "User" ALTER COLUMN "allowProductUpdates" SET DEFAULT true;
ALTER TABLE "User" ADD COLUMN "allowPetitionUpdates" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing petition submitters (they already consented by submitting a petition)
UPDATE "User" SET "allowPetitionUpdates" = true
WHERE id IN (SELECT DISTINCT "userId" FROM "Petition");
