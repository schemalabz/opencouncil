/*
  Warnings:

  - You are about to drop the column `partyId` on the `Person` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Person" DROP CONSTRAINT "Person_partyId_fkey";

-- DropIndex
DROP INDEX "Person_partyId_idx";

-- AlterTable
ALTER TABLE "Person" DROP COLUMN "partyId";
