-- WhatsApp/SMS consent becomes one setting per person: Νότης is one
-- conversation, not one per municipality.
--
-- Every statement here is idempotent. The integration suite replays this file
-- against a database built from schema.prisma, and replays it twice on purpose.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyByPhone" BOOLEAN NOT NULL DEFAULT true;

-- A person who had the channel off in every municipality stays off. Guarded on
-- the old column: it is gone from schema.prisma already, and a later migration
-- drops it from the database, after which this backfill has nothing to read.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'NotificationPreference' AND column_name = 'notifyByPhone'
  ) THEN
    UPDATE "User" u
    SET "notifyByPhone" = false
    WHERE EXISTS (SELECT 1 FROM "NotificationPreference" np WHERE np."userId" = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM "NotificationPreference" np
        WHERE np."userId" = u.id AND np."notifyByPhone"
      );
  END IF;
END $$;

-- The view keeps its columns (a replace, not a drop: the Notis build that is
-- still polling keeps reading it); the flag now comes from the person.
CREATE OR REPLACE VIEW "notis_fanout_targets" AS
SELECT
  np."userId",
  u.name                            AS "userName",
  u.phone,
  u."notisEnabledAt",
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

-- "NotificationPreference"."notifyByPhone" stays for now: the build that is
-- live while this migration runs still selects it on every preference read.
-- A later migration drops it, once no build reads it.
