/*
  Warnings:

  - Added the required column `meetingsToIngest` to the `Offer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "correctnessGuarantee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingsToIngest" INTEGER NOT NULL;
