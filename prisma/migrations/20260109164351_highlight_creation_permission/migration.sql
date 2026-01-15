-- CreateEnum
CREATE TYPE "HighlightCreationPermission" AS ENUM ('EVERYONE', 'ADMINS_ONLY');

-- AlterTable
ALTER TABLE "City" ADD COLUMN     "highlightCreationPermission" "HighlightCreationPermission" NOT NULL DEFAULT 'ADMINS_ONLY';

-- AlterTable
ALTER TABLE "Highlight" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Highlight_cityId_createdById_idx" ON "Highlight"("cityId", "createdById");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
