-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HighlightedUtterance" (
    "id" TEXT NOT NULL,
    "utteranceId" TEXT NOT NULL,
    "highlightId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HighlightedUtterance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Highlight_meetingId_cityId_idx" ON "Highlight"("meetingId", "cityId");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_meetingId_cityId_fkey" FOREIGN KEY ("meetingId", "cityId") REFERENCES "CouncilMeeting"("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlightedUtterance" ADD CONSTRAINT "HighlightedUtterance_utteranceId_fkey" FOREIGN KEY ("utteranceId") REFERENCES "Utterance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlightedUtterance" ADD CONSTRAINT "HighlightedUtterance_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "Highlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
