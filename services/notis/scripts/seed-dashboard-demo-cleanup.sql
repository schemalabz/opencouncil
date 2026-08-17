-- Remove everything seed-dashboard-demo.sql created (all ids are fake-*).
DELETE FROM "NotisWakeQueue" WHERE id LIKE 'fake-%';
DELETE FROM "NotisScheduledWake" WHERE id LIKE 'fake-%';
DELETE FROM "NotisMessage" WHERE id LIKE 'fake-%';
DELETE FROM "NotisProcessedEvent" WHERE "taskId" LIKE 'fake-%';
