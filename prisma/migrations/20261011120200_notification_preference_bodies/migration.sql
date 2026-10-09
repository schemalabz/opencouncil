-- CreateTable
CREATE TABLE "_NotificationBody" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_NotificationBody_AB_unique" ON "_NotificationBody"("A", "B");

-- CreateIndex
CREATE INDEX "_NotificationBody_B_index" ON "_NotificationBody"("B");

-- AddForeignKey
ALTER TABLE "_NotificationBody" ADD CONSTRAINT "_NotificationBody_A_fkey" FOREIGN KEY ("A") REFERENCES "AdministrativeBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationBody" ADD CONSTRAINT "_NotificationBody_B_fkey" FOREIGN KEY ("B") REFERENCES "NotificationPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A reader follows a secondary body of their municipality on their own
-- (#829): the join table above holds the choice. The two views that hand
-- Notis its audience and its events grow a column each, at the end, so
-- CREATE OR REPLACE keeps the columns, the order and the grant to
-- notis_reader. Idempotent: the integration suite replays the views twice.
--
-- notis_fanout_targets: `bodies`, the bodies the preference follows.
CREATE OR REPLACE VIEW "notis_fanout_targets" AS
SELECT
  np."userId",
  u.name                            AS "userName",
  u.phone,
  u."notifyByPhone",
  np."cityId",
  c.name                            AS "cityName",
  c.name_en                         AS "cityNameEn",
  c.realm::text                     AS realm,
  c.language::text                  AS language,
  c.timezone,
  COALESCE(t.topics, '[]'::jsonb)   AS topics,
  COALESCE(l.locations, '[]'::jsonb) AS locations,
  np."updatedAt",
  COALESCE(b.bodies, '[]'::jsonb)   AS bodies
FROM "NotificationPreference" np
JOIN "User" u ON u.id = np."userId"
JOIN "City" c ON c.id = np."cityId"
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', tp.id, 'name', tp.name, 'name_en', tp.name_en) ORDER BY tp.name) AS topics
  FROM "_NotificationTopic" nt
  JOIN "Topic" tp ON tp.id = nt."B"
  WHERE nt."A" = np.id
) t ON true
LEFT JOIN LATERAL (
  -- Centroid, not ST_X/ST_Y directly: locations can be lines or polygons.
  SELECT jsonb_agg(jsonb_build_object(
    'text', loc.text,
    'type', loc.type::text,
    'lng', ST_X(ST_Centroid(loc.coordinates)),
    'lat', ST_Y(ST_Centroid(loc.coordinates))
  ) ORDER BY loc.text) AS locations
  FROM "_NotificationLocation" nl
  JOIN "Location" loc ON loc.id = nl."A"
  WHERE nl."B" = np.id
) l ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', ab.id, 'name', ab.name, 'name_en', ab.name_en) ORDER BY ab.name) AS bodies
  FROM "_NotificationBody" nb
  JOIN "AdministrativeBody" ab ON ab.id = nb."A"
  WHERE nb."B" = np.id
) b ON true;

-- notis_meeting_events: `adminBodyId`, and `followersOnly` for a body of the
-- secondary tier, whose events reach its followers and nobody else. The type
-- list is the SQL twin of SECONDARY_BODY_TYPES (src/lib/utils/bodyTier.ts);
-- a test pins the two to each other. The SELECT list above the new columns
-- is the one of 20261011120000_notis_meeting_events_skip_disabled_bodies.
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
  cm."sessionNumber",
  ab.id              AS "adminBodyId",
  (ab.id IS NOT NULL AND ab.type::text IN ('youthCouncil')) AS "followersOnly"
FROM "TaskStatus" ts
JOIN "CouncilMeeting" cm ON cm."cityId" = ts."cityId" AND cm.id = ts."councilMeetingId"
JOIN "City" c ON c.id = ts."cityId"
LEFT JOIN "AdministrativeBody" ab ON ab.id = cm."administrativeBodyId"
WHERE ts.type IN ('processAgenda', 'summarize')
  AND ts.status = 'succeeded'
  AND (ab.id IS NULL OR ab."notificationBehavior" <> 'NOTIFICATIONS_DISABLED');
