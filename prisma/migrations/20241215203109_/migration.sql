-- CreateEnum
CREATE TYPE "AuthorityType" AS ENUM ('municipality', 'region');

-- AlterTable
ALTER TABLE "City" ADD COLUMN     "authorityType" "AuthorityType" NOT NULL DEFAULT 'municipality';
