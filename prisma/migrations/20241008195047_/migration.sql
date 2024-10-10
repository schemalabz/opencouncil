/*
  Warnings:

  - Added the required column `cityId` to the `Subject` table without a default value. This is not possible if the table is not empty.
  - Added the required column `councilMeetingId` to the `Subject` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "cityId" TEXT NOT NULL,
ADD COLUMN     "councilMeetingId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_cityId_councilMeetingId_fkey" FOREIGN KEY ("cityId", "councilMeetingId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
