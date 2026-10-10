-- The stored name becomes an override. Null means that the title is derived
-- from the session number and the kind (src/lib/meetingName.ts).
BEGIN;

ALTER TABLE "CouncilMeeting"
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "name_en" DROP NOT NULL;

-- Notis reads the facts of a meeting, not its title. "meetingName" keeps its
-- name and position, so CREATE OR REPLACE keeps the grant to notis_reader and
-- a running Notis keeps reading; it now holds the override only, which can be
-- null. Notis derives the title from the override, "meetingKind" and
-- "sessionNumber" with the shared code (@opencouncil/ui/lib/meeting-title).
-- CREATE OR REPLACE VIEW can only append columns, so the two facts come last.
CREATE OR REPLACE VIEW "notis_meeting_events" AS
SELECT
  ts.id              AS "taskId",
  ts.type,
  ts."updatedAt"     AS "completedAt",
  ts."cityId",
  ts."councilMeetingId" AS "meetingId",
  cm.name            AS "meetingName",
  cm."dateTime"      AS "meetingDate",
  cm.released,
  ab.name            AS "adminBodyName",
  c.realm::text      AS realm,
  c.language::text   AS language,
  c.timezone,
  cm.kind::text      AS "meetingKind",
  cm."sessionNumber"
FROM "TaskStatus" ts
JOIN "CouncilMeeting" cm ON cm."cityId" = ts."cityId" AND cm.id = ts."councilMeetingId"
JOIN "City" c ON c.id = ts."cityId"
LEFT JOIN "AdministrativeBody" ab ON ab.id = cm."administrativeBodyId"
WHERE ts.type IN ('processAgenda', 'summarize')
  AND ts.status = 'succeeded';

COMMIT;
