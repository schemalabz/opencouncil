-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "profileUrl" TEXT;

-- CreateIndex
CREATE INDEX "City_isPending_isListed_idx" ON "City"("isPending", "isListed");
