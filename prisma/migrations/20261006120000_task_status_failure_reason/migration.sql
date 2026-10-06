-- "failureReason" holds the failure text of every failed task. "responseBody"
-- holds only a task-server payload.
--
-- Rows from before this migration keep their old content: a failed row can still
-- hold failure text in "responseBody". There is no backfill on purpose. The old
-- rows mix plain error text, error objects and real payloads, and a rewrite
-- cannot tell them apart safely.
ALTER TABLE "TaskStatus" ADD COLUMN "failureReason" TEXT;
