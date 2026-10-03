-- Add a separate column to capture errors thrown by the post-callback
-- processor (e.g. summarize/transcribe/etc.), so the raw task server payload
-- in `responseBody` is preserved verbatim and the task can be replayed
-- without re-running the (paid) backend job. See issue #360.

ALTER TABLE "TaskStatus" ADD COLUMN "processingError" TEXT;
