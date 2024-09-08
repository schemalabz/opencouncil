-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_municipality" TEXT NOT NULL,
    "name_municipality_en" TEXT NOT NULL,
    "logoImage" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_short" TEXT NOT NULL,
    "name_short_en" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_short" TEXT NOT NULL,
    "name_short_en" TEXT NOT NULL,
    "image" TEXT,
    "role" TEXT,
    "role_en" TEXT,
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cityId" TEXT NOT NULL,
    "partyId" TEXT,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilMeeting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "youtubeUrl" TEXT NOT NULL,
    "videoUrl" TEXT,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "CouncilMeeting_pkey" PRIMARY KEY ("cityId","id")
);

-- CreateTable
CREATE TABLE "TaskStatus" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stage" TEXT,
    "percentComplete" DOUBLE PRECISION,
    "type" TEXT NOT NULL,
    "requestBody" TEXT NOT NULL,
    "responseBody" TEXT,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "TaskStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakerTag" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "personId" TEXT,

    CONSTRAINT "SpeakerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakerSegment" (
    "id" TEXT NOT NULL,
    "startTimestamp" DOUBLE PRECISION NOT NULL,
    "endTimestamp" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "speakerTagId" TEXT NOT NULL,

    CONSTRAINT "SpeakerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utterance" (
    "id" TEXT NOT NULL,
    "startTimestamp" DOUBLE PRECISION NOT NULL,
    "endTimestamp" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "speakerSegmentId" TEXT NOT NULL,

    CONSTRAINT "Utterance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Word" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startTimestamp" DOUBLE PRECISION NOT NULL,
    "endTimestamp" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "utteranceId" TEXT NOT NULL,

    CONSTRAINT "Word_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Party_cityId_idx" ON "Party"("cityId");

-- CreateIndex
CREATE INDEX "Person_cityId_idx" ON "Person"("cityId");

-- CreateIndex
CREATE INDEX "Person_partyId_idx" ON "Person"("partyId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_dateTime_idx" ON "CouncilMeeting"("dateTime");

-- CreateIndex
CREATE INDEX "CouncilMeeting_released_idx" ON "CouncilMeeting"("released");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilMeeting_cityId_id_key" ON "CouncilMeeting"("cityId", "id");

-- CreateIndex
CREATE INDEX "TaskStatus_councilMeetingId_cityId_idx" ON "TaskStatus"("councilMeetingId", "cityId");

-- CreateIndex
CREATE INDEX "SpeakerTag_personId_idx" ON "SpeakerTag"("personId");

-- CreateIndex
CREATE INDEX "SpeakerSegment_meetingId_cityId_idx" ON "SpeakerSegment"("meetingId", "cityId");

-- CreateIndex
CREATE INDEX "SpeakerSegment_speakerTagId_idx" ON "SpeakerSegment"("speakerTagId");

-- CreateIndex
CREATE INDEX "Utterance_speakerSegmentId_idx" ON "Utterance"("speakerSegmentId");

-- CreateIndex
CREATE INDEX "Word_utteranceId_idx" ON "Word"("utteranceId");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatus" ADD CONSTRAINT "TaskStatus_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting"("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerTag" ADD CONSTRAINT "SpeakerTag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey" FOREIGN KEY ("meetingId", "cityId") REFERENCES "CouncilMeeting"("id", "cityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_speakerTagId_fkey" FOREIGN KEY ("speakerTagId") REFERENCES "SpeakerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utterance" ADD CONSTRAINT "Utterance_speakerSegmentId_fkey" FOREIGN KEY ("speakerSegmentId") REFERENCES "SpeakerSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Word" ADD CONSTRAINT "Word_utteranceId_fkey" FOREIGN KEY ("utteranceId") REFERENCES "Utterance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
