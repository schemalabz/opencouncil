-- The queue's per-subscription serialization enforced at the database.
-- claimNext's NOT EXISTS guard is snapshot-based and racks under concurrent
-- claims (SKIP LOCKED hides the racing row while the snapshot still shows
-- it pending); this partial unique index is the invariant — the losing
-- claim hits a unique violation and treats it as nothing-claimable.

CREATE UNIQUE INDEX IF NOT EXISTS "NotisWakeQueue_one_running_per_sub"
ON "NotisWakeQueue"("subscriptionId")
WHERE status = 'running'::"QueueItemStatus";
