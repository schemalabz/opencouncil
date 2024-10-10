-- CreateTable
CREATE TABLE "PodcastPartAudioUtterance" (
    "id" TEXT NOT NULL,
    "podcastPartId" TEXT NOT NULL,
    "utteranceId" TEXT NOT NULL,

    CONSTRAINT "PodcastPartAudioUtterance_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PodcastPartAudioUtterance" ADD CONSTRAINT "PodcastPartAudioUtterance_podcastPartId_fkey" FOREIGN KEY ("podcastPartId") REFERENCES "PodcastPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastPartAudioUtterance" ADD CONSTRAINT "PodcastPartAudioUtterance_utteranceId_fkey" FOREIGN KEY ("utteranceId") REFERENCES "Utterance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
