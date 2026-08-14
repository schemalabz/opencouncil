-- CreateTable
CREATE TABLE "DecisionCandidate" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "ada" TEXT NOT NULL,
    "title" TEXT,
    "pdfUrl" TEXT NOT NULL,
    "publishDate" TIMESTAMP(3),
    "protocolNumber" TEXT,
    "meetingDate" TIMESTAMP(3),
    "decisionNumber" TEXT,
    "readStatus" TEXT NOT NULL,
    "councilMeetingId" TEXT,
    "subjectId" TEXT,
    "confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "decisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionCandidate_decisionId_key" ON "DecisionCandidate"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionCandidate_cityId_ada_key" ON "DecisionCandidate"("cityId", "ada");

-- CreateIndex
CREATE INDEX "DecisionCandidate_cityId_publishDate_idx" ON "DecisionCandidate"("cityId", "publishDate");

-- CreateIndex
CREATE INDEX "DecisionCandidate_councilMeetingId_idx" ON "DecisionCandidate"("councilMeetingId");

-- AddForeignKey
ALTER TABLE "DecisionCandidate" ADD CONSTRAINT "DecisionCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
