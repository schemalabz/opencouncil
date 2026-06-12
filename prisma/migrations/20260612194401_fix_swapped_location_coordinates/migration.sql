-- Fix legacy axis-swapped Location points.
--
-- The task-server ingestion path historically sent point coordinates as
-- [lat, lng] and they were stored verbatim, so most Location rows hold
-- x = latitude, y = longitude instead of GeoJSON's [lng, lat]. Greece's
-- latitude (34–42.5) and longitude (19–30) ranges are disjoint, so swapped
-- rows can be identified unambiguously: a point whose x looks like a Greek
-- latitude AND whose y looks like a Greek longitude is swapped.
--
-- Correctly stored rows (x in 19–30, y in 34–42.5) don't match the predicate
-- and are left untouched, as are out-of-range junk geocodes.
UPDATE "Location"
SET coordinates = ST_SetSRID(ST_MakePoint(ST_Y(coordinates::geometry), ST_X(coordinates::geometry)), 4326)
WHERE type = 'point'
  AND ST_X(coordinates::geometry) BETWEEN 34 AND 42.5
  AND ST_Y(coordinates::geometry) BETWEEN 19 AND 30;
