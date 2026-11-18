-- AlterEnum
ALTER TYPE "AdministrativeBodyType" ADD VALUE 'youthCouncil';

-- CreateEnum
CREATE TYPE "BodyTier" AS ENUM ('primary', 'secondary');

-- AlterTable
-- The default fills the existing rows. It is then dropped, so every create
-- must state the tier.
ALTER TABLE "AdministrativeBody" ADD COLUMN "tier" "BodyTier" NOT NULL DEFAULT 'primary';
ALTER TABLE "AdministrativeBody" ALTER COLUMN "tier" DROP DEFAULT;
