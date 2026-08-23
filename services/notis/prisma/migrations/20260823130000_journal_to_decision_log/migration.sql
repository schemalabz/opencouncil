-- The journal table is retired: the agent reads the conversation from the
-- message rows (their own delivery status) and its decision log from the wake
-- rows, which now also carry the shell's model-less decisions (ΣΤΟΠ pre-step,
-- cap skip, phone-gone unsubscribe). model/trace become nullable — null marks
-- "no model ran". Idempotent so the integration harness can replay it.

ALTER TABLE "NotisWake" ALTER COLUMN "model" DROP NOT NULL;
ALTER TABLE "NotisWake" ALTER COLUMN "trace" DROP NOT NULL;

DROP TABLE IF EXISTS "NotisJournalEntry";
