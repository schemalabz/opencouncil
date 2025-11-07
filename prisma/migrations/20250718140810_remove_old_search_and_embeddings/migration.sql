/*
  Warnings:

  - You are about to drop the column `embedding` on the `SpeakerSegment` table. All the data in the column will be lost.

*/
-- AlterTable
-- Drop column only if it exists (PostgreSQL 9.2+ supports IF EXISTS)
ALTER TABLE "SpeakerSegment" DROP COLUMN IF EXISTS "embedding";
