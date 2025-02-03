-- CreateEnum
CREATE TYPE "AdministrativeBodyType" AS ENUM ('council', 'committee', 'community');

-- AlterTable
ALTER TABLE "CouncilMeeting" ADD COLUMN     "administrativeBodyId" TEXT;

-- CreateTable
CREATE TABLE "AdministrativeBody" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "type" "AdministrativeBodyType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "AdministrativeBody_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdministrativeBody_cityId_idx" ON "AdministrativeBody"("cityId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_administrativeBodyId_idx" ON "CouncilMeeting"("administrativeBodyId");

-- AddForeignKey
ALTER TABLE "AdministrativeBody" ADD CONSTRAINT "AdministrativeBody_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_administrativeBodyId_fkey" FOREIGN KEY ("administrativeBodyId") REFERENCES "AdministrativeBody"("id") ON DELETE SET NULL ON UPDATE CASCADE;
