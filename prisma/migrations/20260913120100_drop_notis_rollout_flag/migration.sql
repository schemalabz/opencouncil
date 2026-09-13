-- The Notis rollout flag is retired: every reader with a mobile number is
-- served by Notis, and nothing reads User.notisEnabledAt. The two views that
-- carried it lose the column, which takes a drop and a create (CREATE OR
-- REPLACE VIEW can only add columns), and the grants that the drop takes with
-- it come back. Every statement is idempotent: the integration suite replays
-- this file twice.
DROP VIEW IF EXISTS "notis_fanout_targets";
DROP VIEW IF EXISTS "notis_users";
ALTER TABLE "User" DROP COLUMN IF EXISTS "notisEnabledAt";

-- Unfiltered on purpose: the Notis janitor treats row-existence as the
-- account-deletion signal, so a filter here would read as a mass deletion.
CREATE VIEW "notis_users" AS
SELECT
  u.id,
  u.name,
  u.phone,
  u."createdAt",
  u."updatedAt"
FROM "User" u;

-- One row per notification preference (user x city), with the person's
-- WhatsApp consent on every row. City rows carry realm/language/timezone —
-- realm belongs to cities and meetings, never to users. Enums are cast to
-- text so the contract stays plain SQL types.
CREATE VIEW "notis_fanout_targets" AS
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notis_reader') THEN
    GRANT SELECT ON "notis_users", "notis_fanout_targets" TO notis_reader;
  END IF;
END
$$;
