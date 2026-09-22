-- The agenda section an item sits under (issue 366). Null means the agenda has
-- one numbered list, which is every row written before this migration.
-- IF NOT EXISTS: the integration suite replays this file twice.
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "agendaSectionIndex" INTEGER;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "agendaSectionTitle" TEXT;
