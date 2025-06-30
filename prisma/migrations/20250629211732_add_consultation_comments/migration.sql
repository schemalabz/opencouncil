-- CreateEnum
CREATE TYPE "ConsultationCommentEntityType" AS ENUM ('CHAPTER', 'ARTICLE', 'GEOSET', 'GEOMETRY');

-- CreateTable
CREATE TABLE "ConsultationComment" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" "ConsultationCommentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "ConsultationComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationCommentUpvote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,

    CONSTRAINT "ConsultationCommentUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultationComment_consultationId_entityType_entityId_idx" ON "ConsultationComment"("consultationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ConsultationComment_cityId_idx" ON "ConsultationComment"("cityId");

-- CreateIndex
CREATE INDEX "ConsultationComment_userId_idx" ON "ConsultationComment"("userId");

-- CreateIndex
CREATE INDEX "ConsultationCommentUpvote_commentId_idx" ON "ConsultationCommentUpvote"("commentId");

-- CreateIndex
CREATE INDEX "ConsultationCommentUpvote_userId_idx" ON "ConsultationCommentUpvote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationCommentUpvote_userId_commentId_key" ON "ConsultationCommentUpvote"("userId", "commentId");

-- AddForeignKey
ALTER TABLE "ConsultationComment" ADD CONSTRAINT "ConsultationComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationComment" ADD CONSTRAINT "ConsultationComment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationComment" ADD CONSTRAINT "ConsultationComment_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationCommentUpvote" ADD CONSTRAINT "ConsultationCommentUpvote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationCommentUpvote" ADD CONSTRAINT "ConsultationCommentUpvote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ConsultationComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
