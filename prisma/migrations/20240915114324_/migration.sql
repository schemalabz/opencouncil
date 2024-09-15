/*
  Warnings:

  - You are about to drop the column `officialSupport` on the `Party` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "City" ADD COLUMN     "officialSupport" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Party" DROP COLUMN "officialSupport";
