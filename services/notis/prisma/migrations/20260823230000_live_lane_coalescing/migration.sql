-- Live-lane coalescing: one pending live row per subscription, so a second
-- inbound appends to the waiting wake instead of queueing a second answer.
-- Replay-safe: the dedupe CTE is empty once the index exists.

-- Merge any existing duplicate pending live rows (oldest wins, events
-- concatenated in arrival order) before the unique index can be created.
WITH dupes AS (
  SELECT "subscriptionId",
         (array_agg(id ORDER BY "createdAt", id))[1] AS keep_id,
         array_agg(id ORDER BY "createdAt", id) AS ids
  FROM "NotisWakeQueue"
  WHERE status = 'pending'::"QueueItemStatus" AND lane = 'live'::"QueueLane"
  GROUP BY "subscriptionId"
  HAVING count(*) > 1
),
merged AS (
  SELECT d.keep_id, jsonb_agg(e.elem ORDER BY q."createdAt", q.id, e.ord) AS extra
  FROM dupes d
  JOIN "NotisWakeQueue" q ON q.id = ANY(d.ids) AND q.id <> d.keep_id
  CROSS JOIN LATERAL jsonb_array_elements(q.events) WITH ORDINALITY AS e(elem, ord)
  GROUP BY d.keep_id
)
UPDATE "NotisWakeQueue" q
SET events = q.events || m.extra
FROM merged m
WHERE q.id = m.keep_id;

DELETE FROM "NotisWakeQueue" q
USING (
  SELECT unnest(ids[2:]) AS drop_id
  FROM (
    SELECT array_agg(id ORDER BY "createdAt", id) AS ids
    FROM "NotisWakeQueue"
    WHERE status = 'pending'::"QueueItemStatus" AND lane = 'live'::"QueueLane"
    GROUP BY "subscriptionId"
    HAVING count(*) > 1
  ) g
) d
WHERE q.id = d.drop_id;

CREATE UNIQUE INDEX IF NOT EXISTS "NotisWakeQueue_one_pending_live_per_sub"
  ON "NotisWakeQueue" ("subscriptionId")
  WHERE status = 'pending'::"QueueItemStatus" AND lane = 'live'::"QueueLane";
