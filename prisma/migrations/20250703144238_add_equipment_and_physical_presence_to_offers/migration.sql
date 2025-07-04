-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "equipmentRentalDescription" TEXT,
ADD COLUMN     "equipmentRentalName" TEXT,
ADD COLUMN     "equipmentRentalPrice" DOUBLE PRECISION,
ADD COLUMN     "physicalPresenceHours" INTEGER;
