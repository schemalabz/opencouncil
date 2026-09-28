-- CreateTable
CREATE TABLE "PendingConsultationComment" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" "ConsultationCommentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "PendingConsultationComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingConsultationComment_userId_idx" ON "PendingConsultationComment"("userId");

-- AddForeignKey
ALTER TABLE "PendingConsultationComment" ADD CONSTRAINT "PendingConsultationComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingConsultationComment" ADD CONSTRAINT "PendingConsultationComment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingConsultationComment" ADD CONSTRAINT "PendingConsultationComment_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

