-- The cities snapshot is gone: wake assembly, fan-out audience selection,
-- and the panel read the live notis_fanout_targets view instead.
ALTER TABLE "NotisSubscription" DROP COLUMN IF EXISTS "cities";
