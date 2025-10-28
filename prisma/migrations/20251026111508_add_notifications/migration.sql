-- CreateEnum
CREATE TYPE "NotificationBehavior" AS ENUM ('NOTIFICATIONS_DISABLED', 'NOTIFICATIONS_AUTO', 'NOTIFICATIONS_APPROVAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('beforeMeeting', 'afterMeeting');

-- CreateEnum
CREATE TYPE "NotificationSubjectReason" AS ENUM ('proximity', 'topic', 'generalInterest');

-- CreateEnum
CREATE TYPE "NotificationMedium" AS ENUM ('email', 'message');

-- CreateEnum
CREATE TYPE "NotificationMessageType" AS ENUM ('whatsapp', 'sms');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('pending', 'sent', 'failed');

-- AlterTable
ALTER TABLE "AdministrativeBody" ADD COLUMN     "notificationBehavior" "NotificationBehavior" NOT NULL DEFAULT 'NOTIFICATIONS_APPROVAL';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSubject" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reason" "NotificationSubjectReason" NOT NULL,
    "notificationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,

    CONSTRAINT "NotificationSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notificationId" TEXT NOT NULL,
    "medium" "NotificationMedium" NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "messageSentVia" "NotificationMessageType",
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_cityId_meetingId_type_idx" ON "Notification"("cityId", "meetingId", "type");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_cityId_meetingId_type_key" ON "Notification"("userId", "cityId", "meetingId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSubject_notificationId_subjectId_key" ON "NotificationSubject"("notificationId", "subjectId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- CreateIndex
CREATE INDEX "NotificationDelivery_createdAt_idx" ON "NotificationDelivery"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_medium_key" ON "NotificationDelivery"("notificationId", "medium");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_meetingId_cityId_fkey" FOREIGN KEY ("meetingId", "cityId") REFERENCES "CouncilMeeting"("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubject" ADD CONSTRAINT "NotificationSubject_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubject" ADD CONSTRAINT "NotificationSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
