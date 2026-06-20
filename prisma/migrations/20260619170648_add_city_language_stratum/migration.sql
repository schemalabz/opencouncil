-- CreateEnum
CREATE TYPE "CityLanguage" AS ENUM ('el', 'fr');

-- CreateEnum
CREATE TYPE "Stratum" AS ENUM ('greece', 'france');

-- AlterTable
ALTER TABLE "City" ADD COLUMN     "language" "CityLanguage" NOT NULL DEFAULT 'el',
ADD COLUMN     "stratum" "Stratum" NOT NULL DEFAULT 'greece';

-- CreateIndex
CREATE INDEX "City_stratum_idx" ON "City"("stratum");
