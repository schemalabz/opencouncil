-- CreateEnum
CREATE TYPE "CityLanguage" AS ENUM ('el', 'fr');

-- CreateEnum
CREATE TYPE "Realm" AS ENUM ('greece', 'france');

-- AlterTable
ALTER TABLE "City" ADD COLUMN     "language" "CityLanguage" NOT NULL DEFAULT 'el',
ADD COLUMN     "realm" "Realm" NOT NULL DEFAULT 'greece';

-- CreateIndex
CREATE INDEX "City_realm_idx" ON "City"("realm");
