-- A body whose notifications are off must not reach the Notis subscribers
-- either (#829). The app's own notification path has read
-- AdministrativeBody.notificationBehavior since it existed; the view that
-- hands Notis its meeting events did not, so a youth council's agenda went
-- out on WhatsApp to every subscriber of its municipality. The view now skips
-- the meetings of a disabled body. A meeting with no body stays in, as before.
--
-- The SELECT list is the one of 20261010120100_meeting_title. The columns do
-- not change, so CREATE OR REPLACE keeps the grant to notis_reader.
-- Idempotent: the integration suite replays this file twice.
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
  AND ts.status = 'succeeded'
  AND (ab.id IS NULL OR ab."notificationBehavior" <> 'NOTIFICATIONS_DISABLED');
