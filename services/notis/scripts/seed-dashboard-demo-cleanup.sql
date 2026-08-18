-- Remove everything scripts/seed-dashboard-demo.sql inserted.
-- Apply: psql "$NOTIS_DATABASE_URL" -f scripts/seed-dashboard-demo-cleanup.sql
DELETE FROM "NotisWakeQueue" WHERE id LIKE 'fake-%';
DELETE FROM "NotisMessage" WHERE id LIKE 'fake-%';
DELETE FROM "NotisScheduledWake" WHERE id LIKE 'fake-%';
DELETE FROM "NotisProcessedEvent" WHERE "taskId" LIKE 'fake-%';
-- Last: the rows above cascade from it anyway, but deleting them by prefix
-- keeps the script readable when only some were seeded.
DELETE FROM "NotisSubscription" WHERE id LIKE 'fake-%';
