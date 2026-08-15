-- Notis integration surface: the rollout column, five read-only views and the
-- notis_reader role. The views are the contract the Notis service reads; the
-- main schema can evolve underneath them. Every statement is idempotent so the
-- integration suite can execute this file on top of a `prisma db push` schema.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notisEnabledAt" TIMESTAMP(3);

-- Message deliveries created before a user's Notis enablement are skipped at
-- the send boundary, not sent and not counted as failures.
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE IF NOT EXISTS 'skipped';

-- digest() for the hashed session views below.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- DROP + CREATE (not OR REPLACE) so a column change in a view stays
-- idempotent; grants are re-issued at the bottom of this file.
DROP VIEW IF EXISTS "notis_users";
DROP VIEW IF EXISTS "notis_fanout_targets";
DROP VIEW IF EXISTS "notis_meeting_events";
DROP VIEW IF EXISTS "notis_sessions";
DROP VIEW IF EXISTS "notis_admin_sessions";

-- Unfiltered on purpose: the Notis janitor treats row-existence as the
-- account-deletion signal, so a filter here would read as a mass deletion.
CREATE VIEW "notis_users" AS
SELECT
  u.id,
  u.name,
  u.phone,
  u."notisEnabledAt",
  u."createdAt",
  u."updatedAt"
FROM "User" u;

-- One row per notification preference (user x city). Carries the rollout flag
-- instead of filtering on it: the poller enrolls only enabled users, while the
-- playground can simulate anyone. City rows carry realm/language/timezone —
-- realm belongs to cities and meetings, never to users. Enums are cast to text
-- so the contract stays plain SQL types.
CREATE VIEW "notis_fanout_targets" AS
SELECT
  np."userId",
  u.name                            AS "userName",
  u.phone,
  u."notisEnabledAt",
  np."notifyByPhone",
  np."cityId",
  c.name                            AS "cityName",
  c.name_en                         AS "cityNameEn",
  c.realm::text                     AS realm,
  c.language::text                  AS language,
  c.timezone,
  COALESCE(t.topics, '[]'::jsonb)   AS topics,
  COALESCE(l.locations, '[]'::jsonb) AS locations,
  np."updatedAt"
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
) l ON true;

-- Completed pipeline tasks are the meeting events. taskId is the dedup key: a
-- reprocessed meeting produces a new task row and counts as a fresh event.
CREATE VIEW "notis_meeting_events" AS
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
  c.timezone
FROM "TaskStatus" ts
JOIN "CouncilMeeting" cm ON cm."cityId" = ts."cityId" AND cm.id = ts."councilMeetingId"
JOIN "City" c ON c.id = ts."cityId"
LEFT JOIN "AdministrativeBody" ab ON ab.id = cm."administrativeBodyId"
WHERE ts.type IN ('processAgenda', 'summarize')
  AND ts.status = 'succeeded';

-- Cookie validation exposes a SHA-256 of the token, never the token: the
-- browser-side mirror cookie carries the same hash, so nothing that reaches
-- Notis (or any other subdomain host) can be replayed as the Auth.js session
-- cookie against the main app.

-- Self-service profile endpoints (any user).
CREATE VIEW "notis_sessions" AS
SELECT
  encode(digest(s."sessionToken", 'sha256'), 'hex') AS "sessionTokenHash",
  s."userId",
  s.expires
FROM "Session" s;

-- The Notis admin panel: superadmins only.
CREATE VIEW "notis_admin_sessions" AS
SELECT
  encode(digest(s."sessionToken", 'sha256'), 'hex') AS "sessionTokenHash",
  s."userId",
  s.expires,
  u.name AS "userName"
FROM "Session" s
JOIN "User" u ON u.id = s."userId"
WHERE u."isSuperAdmin";

-- The Notis service connects as a login user created per environment with
-- CREATE USER notis_service LOGIN PASSWORD '...' IN ROLE notis_reader;
-- The role can read the five views and nothing else, so the service
-- physically cannot write the main database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'notis_reader') THEN
    CREATE ROLE notis_reader NOLOGIN;
  END IF;
END
$$;

-- USAGE only resolves names in the schema; it grants no table access. Not
-- every database keeps the default PUBLIC grant on the public schema (a
-- recreated or hardened schema drops it), so grant it explicitly.
GRANT USAGE ON SCHEMA public TO notis_reader;
GRANT SELECT ON "notis_users", "notis_fanout_targets", "notis_meeting_events", "notis_sessions", "notis_admin_sessions" TO notis_reader;
