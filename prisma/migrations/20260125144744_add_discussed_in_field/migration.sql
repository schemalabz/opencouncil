-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "discussedInId" TEXT;

-- CreateIndex
CREATE INDEX "Subject_discussedInId_idx" ON "Subject"("discussedInId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_discussedInId_fkey" FOREIGN KEY ("discussedInId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
