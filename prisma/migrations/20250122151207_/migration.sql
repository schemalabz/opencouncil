-- CreateTable
CREATE TABLE "UtteranceEdit" (
    "id" TEXT NOT NULL,
    "utteranceId" TEXT NOT NULL,
    "beforeText" TEXT NOT NULL,
    "afterText" TEXT NOT NULL,
    "editedBy" "LastModifiedBy" NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtteranceEdit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UtteranceEdit" ADD CONSTRAINT "UtteranceEdit_utteranceId_fkey" FOREIGN KEY ("utteranceId") REFERENCES "Utterance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtteranceEdit" ADD CONSTRAINT "UtteranceEdit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
