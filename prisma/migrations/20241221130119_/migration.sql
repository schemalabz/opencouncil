-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis" WITH VERSION "3.3.5";

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('point', 'lineString', 'polygon');

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "SubjectSpeakerSegment" ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "text" TEXT NOT NULL,
    "coordinates" geometry NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
