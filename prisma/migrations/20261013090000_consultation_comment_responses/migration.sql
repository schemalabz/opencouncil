-- One public response of the municipality under a consultation comment, in the
-- municipality's name. "emailSentAt" is when the email that joins the comment's
-- author and the municipality went out; it stays NULL until a send succeeds.

-- CreateTable
CREATE TABLE "ConsultationCommentResponse" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "commentId" TEXT NOT NULL,
    "authorUserId" TEXT,

    CONSTRAINT "ConsultationCommentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationCommentResponse_commentId_key" ON "ConsultationCommentResponse"("commentId");

-- CreateIndex
CREATE INDEX "ConsultationCommentResponse_authorUserId_idx" ON "ConsultationCommentResponse"("authorUserId");

-- AddForeignKey
ALTER TABLE "ConsultationCommentResponse" ADD CONSTRAINT "ConsultationCommentResponse_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ConsultationComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationCommentResponse" ADD CONSTRAINT "ConsultationCommentResponse_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
