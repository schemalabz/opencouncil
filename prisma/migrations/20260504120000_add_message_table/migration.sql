-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('whatsapp', 'sms');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('pending', 'sent', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "birdMessageId" TEXT,
    "conversationId" TEXT,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'pending',
    "notificationDeliveryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Message_birdMessageId_key" ON "Message"("birdMessageId");

-- CreateIndex
CREATE INDEX "Message_phone_idx" ON "Message"("phone");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_notificationDeliveryId_fkey" FOREIGN KEY ("notificationDeliveryId") REFERENCES "NotificationDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
