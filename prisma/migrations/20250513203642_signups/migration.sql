-- AlterTable
ALTER TABLE "City" ADD COLUMN     "supportsNotifications" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Petition" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "is_resident" BOOLEAN NOT NULL DEFAULT false,
    "is_citizen" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Petition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_NotificationLocation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_NotificationTopic" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Petition_userId_idx" ON "Petition"("userId");

-- CreateIndex
CREATE INDEX "Petition_cityId_idx" ON "Petition"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "Petition_userId_cityId_key" ON "Petition"("userId", "cityId");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_cityId_idx" ON "NotificationPreference"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_cityId_key" ON "NotificationPreference"("userId", "cityId");

-- CreateIndex
CREATE UNIQUE INDEX "_NotificationLocation_AB_unique" ON "_NotificationLocation"("A", "B");

-- CreateIndex
CREATE INDEX "_NotificationLocation_B_index" ON "_NotificationLocation"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_NotificationTopic_AB_unique" ON "_NotificationTopic"("A", "B");

-- CreateIndex
CREATE INDEX "_NotificationTopic_B_index" ON "_NotificationTopic"("B");

-- AddForeignKey
ALTER TABLE "Petition" ADD CONSTRAINT "Petition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Petition" ADD CONSTRAINT "Petition_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationLocation" ADD CONSTRAINT "_NotificationLocation_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationLocation" ADD CONSTRAINT "_NotificationLocation_B_fkey" FOREIGN KEY ("B") REFERENCES "NotificationPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationTopic" ADD CONSTRAINT "_NotificationTopic_A_fkey" FOREIGN KEY ("A") REFERENCES "NotificationPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationTopic" ADD CONSTRAINT "_NotificationTopic_B_fkey" FOREIGN KEY ("B") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
