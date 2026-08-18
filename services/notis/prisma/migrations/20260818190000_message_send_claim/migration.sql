-- A send claim for outbound rows. The sweeper re-sends anything still
-- `pending`, and two overlapping sweeps could both call Bird for one row: the
-- send is not instantaneous, the row is only updated when it returns, and the
-- interval does not wait for the previous run. Claiming the row first makes
-- the second sweep skip it, instead of relying on Bird to deduplicate two
-- simultaneous requests carrying the same idempotency key.
ALTER TABLE "NotisMessage" ADD COLUMN IF NOT EXISTS "sendingAt" TIMESTAMP(3);
