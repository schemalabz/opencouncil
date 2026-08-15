-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'paused_no_phone', 'unsubscribed');

-- CreateEnum
CREATE TYPE "SubscriptionOrigin" AS ENUM ('transition', 'signup');

-- CreateEnum
CREATE TYPE "WakeDecision" AS ENUM ('send', 'silence', 'error');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageDeliveryMode" AS ENUM ('template', 'freeform');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "QueueLane" AS ENUM ('live', 'batch');

-- CreateEnum
CREATE TYPE "QueueItemStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "NotisSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "origin" "SubscriptionOrigin" NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "profileText" TEXT NOT NULL,
    "cities" JSONB NOT NULL DEFAULT '[]',
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotisSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotisWake" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "event" JSONB NOT NULL,
    "decision" "WakeDecision" NOT NULL,
    "rationale" TEXT NOT NULL,
    "outcome" JSONB NOT NULL,
    "delivery" JSONB,
    "repairs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "finishWakeMissing" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL,
    "usage" JSONB NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "trace" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotisWake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotisMessage" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "wakeId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "deliveryMode" "MessageDeliveryMode",
    "template" TEXT,
    "status" "MessageStatus",
    "birdMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotisMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotisJournalEntry" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "wakeId" TEXT,
    "seq" INTEGER NOT NULL,
    "entry" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotisJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotisScheduledWake" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "runAfter" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotisScheduledWake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotisWakeQueue" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "lane" "QueueLane" NOT NULL,
    "events" JSONB NOT NULL,
    "runAfter" TIMESTAMP(3) NOT NULL,
    "status" "QueueItemStatus" NOT NULL DEFAULT 'pending',
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotisWakeQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotisProcessedEvent" (
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotisProcessedEvent_pkey" PRIMARY KEY ("taskId")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotisSubscription_userId_key" ON "NotisSubscription"("userId");

-- CreateIndex
CREATE INDEX "NotisSubscription_status_idx" ON "NotisSubscription"("status");

-- CreateIndex
CREATE INDEX "NotisWake_subscriptionId_createdAt_idx" ON "NotisWake"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "NotisWake_createdAt_idx" ON "NotisWake"("createdAt");

-- CreateIndex
CREATE INDEX "NotisMessage_subscriptionId_createdAt_idx" ON "NotisMessage"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotisJournalEntry_subscriptionId_seq_key" ON "NotisJournalEntry"("subscriptionId", "seq");

-- CreateIndex
CREATE INDEX "NotisScheduledWake_runAfter_idx" ON "NotisScheduledWake"("runAfter");

-- CreateIndex
CREATE INDEX "NotisWakeQueue_status_runAfter_idx" ON "NotisWakeQueue"("status", "runAfter");

-- CreateIndex
CREATE INDEX "NotisWakeQueue_subscriptionId_status_idx" ON "NotisWakeQueue"("subscriptionId", "status");

-- AddForeignKey
ALTER TABLE "NotisWake" ADD CONSTRAINT "NotisWake_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotisSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotisMessage" ADD CONSTRAINT "NotisMessage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotisSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotisMessage" ADD CONSTRAINT "NotisMessage_wakeId_fkey" FOREIGN KEY ("wakeId") REFERENCES "NotisWake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotisJournalEntry" ADD CONSTRAINT "NotisJournalEntry_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotisSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotisScheduledWake" ADD CONSTRAINT "NotisScheduledWake_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotisSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotisWakeQueue" ADD CONSTRAINT "NotisWakeQueue_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotisSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
