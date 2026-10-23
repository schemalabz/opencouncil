-- The effort a wake ran at. Reactive wakes (a reader wrote) and proactive
-- wakes run at different levels from now on, and the row has to say which.
-- Null on rows older than the column and on model-less wakes.
ALTER TABLE "NotisWake" ADD COLUMN IF NOT EXISTS "effort" TEXT;
