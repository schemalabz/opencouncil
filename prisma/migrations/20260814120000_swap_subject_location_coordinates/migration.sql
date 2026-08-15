-- Subject locations hold their coordinates in the reverse order.
--
-- The summarize pipeline emits `[lat, lng]`. createLocationInTx passes that array
-- to ST_GeomFromGeoJSON, which reads it as `[lng, lat]`. Every subject location is
-- therefore stored as POINT(lat lng). This migration flips those geometries to the
-- correct POINT(lng lat) order.
--
-- Notification preference locations use a different writer, createLocation, which
-- calls ST_MakePoint(longitude, latitude). Those rows are already correct, so the
-- WHERE clause excludes them.
--
-- ST_FlipCoordinates handles every LocationType (point, lineString, polygon) and
-- keeps the SRID.

UPDATE "Location" AS l
SET coordinates = ST_FlipCoordinates(l.coordinates)
WHERE EXISTS (SELECT 1 FROM "Subject" s WHERE s."locationId" = l.id);
