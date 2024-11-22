/*
  Warnings:

  - Added the required column `respondToEmail` to the `Offer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `respondToName` to the `Offer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `respondToPhone` to the `Offer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "respondToEmail" TEXT NOT NULL,
ADD COLUMN     "respondToName" TEXT NOT NULL,
ADD COLUMN     "respondToPhone" TEXT NOT NULL;
