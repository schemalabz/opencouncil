-- A meeting that was held with no recording (#829). The body states it, so
-- the page promises no video and no transcript, and the pipelines skip it.
ALTER TABLE "CouncilMeeting" ADD COLUMN "noRecording" BOOLEAN NOT NULL DEFAULT false;
