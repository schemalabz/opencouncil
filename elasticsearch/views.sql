-- ============================================================================
-- Elasticsearch PGSync Views
-- ============================================================================
-- These views are required for PGSync to properly sync data to Elasticsearch
-- Run this file whenever setting up a new database or environment
-- Usage: psql "$DATABASE_URL" < elasticsearch/views.sql
-- ============================================================================

\echo '========================================='
\echo 'Creating Elasticsearch PGSync Views...'
\echo '========================================='
\echo ''

-- View 1: Location geometry to GeoJSON
-- Why this view? Converts PostGIS geometry to GeoJSON format that Elasticsearch can index.
--   - PostgreSQL stores coordinates as PostGIS geometry type
--   - Elasticsearch requires geo_shape fields to be in GeoJSON format
--   - ST_AsGeoJSON handles the conversion automatically
\echo 'Creating LocationSearchView...'
CREATE OR REPLACE VIEW "LocationSearchView" AS
SELECT 
  l.id, 
  l.text, 
  ST_AsGeoJSON(l.coordinates)::jsonb AS geojson
FROM "Location" l;
\echo '✓ LocationSearchView created'
\echo ''

-- View 2: Party details for person who introduced subject (via Role)
-- Why this view? Person and Party are connected through the Role table, not directly.
-- This view:
--   - Filters for active roles (no end date or future end date)
--   - Prefers head roles (isHead = true)
--   - Takes the most recent role if multiple match
--   - Uses Party's cityId since Role may not have cityId when it's a party role
\echo 'Creating IntroducedByPartyView...'
CREATE OR REPLACE VIEW "IntroducedByPartyView" AS
SELECT DISTINCT ON (r."personId", pa."cityId")
  r."personId" AS person_id,
  pa."cityId" AS city_id,
  p.id AS party_id,
  p.name AS party_name,
  p.name_en AS party_name_en
FROM "Role" r
INNER JOIN "Party" pa ON r."partyId" = pa.id
LEFT JOIN "Party" p ON r."partyId" = p.id
WHERE r."partyId" IS NOT NULL
  AND (r."endDate" IS NULL OR r."endDate" > NOW())
ORDER BY r."personId", pa."cityId", r."isHead" DESC, r."startDate" DESC NULLS LAST;
\echo '✓ IntroducedByPartyView created'
\echo ''

-- View 3: Speaker segments with party details via Role
-- Why this view? This view:
--   - Concatenates all utterance texts within a speaker segment (ordered by timestamp)
--   - Includes the segment summary from SubjectSpeakerSegment
--   - Resolves speaker party through active roles (same logic as IntroducedByPartyView)
\echo 'Creating SubjectSpeakerSegmentSearchView...'
CREATE OR REPLACE VIEW "SubjectSpeakerSegmentSearchView" AS
SELECT
  sss."subjectId" AS subject_id,
  ss.id AS segment_id,
  u.utterances_text AS text,
  sss.summary AS summary,
  sp.id AS speaker_person_id,
  sp.name AS speaker_person_name,
  sp.name_en AS speaker_person_name_en,
  r_party.party_id AS speaker_party_id,
  r_party.party_name AS speaker_party_name,
  r_party.party_name_en AS speaker_party_name_en
FROM "SubjectSpeakerSegment" sss
LEFT JOIN "SpeakerSegment" ss ON ss.id = sss."speakerSegmentId"
LEFT JOIN "SpeakerTag" st ON ss."speakerTagId" = st.id
LEFT JOIN "Person" sp ON st."personId" = sp.id
LEFT JOIN LATERAL (
  SELECT string_agg(u.text, ' ' ORDER BY u."startTimestamp") AS utterances_text
  FROM "Utterance" u
  WHERE u."speakerSegmentId" = ss.id
) u ON true
LEFT JOIN LATERAL (
  SELECT 
    pa.id AS party_id,
    pa.name AS party_name,
    pa.name_en AS party_name_en
  FROM "Role" r
  INNER JOIN "Party" pa ON r."partyId" = pa.id
  WHERE r."personId" = sp.id
    AND pa."cityId" = sp."cityId"
    AND (r."endDate" IS NULL OR r."endDate" > NOW())
  ORDER BY r."isHead" DESC, r."startDate" DESC NULLS LAST
  LIMIT 1
) r_party ON true;
\echo '✓ SubjectSpeakerSegmentSearchView created'
\echo ''

-- ============================================================================
-- VERIFICATION CHECKS
-- ============================================================================
\echo '========================================='
\echo 'Running Verification Checks...'
\echo '========================================='
\echo ''

-- Check 1: Verify all views exist
\echo '1. Checking if all views exist...'
SELECT 
  CASE 
    WHEN COUNT(*) = 3 THEN '   ✓ All 3 views exist'
    ELSE '   ✗ Missing views! Expected 3, found ' || COUNT(*)::text
  END AS result
FROM pg_views 
WHERE schemaname = 'public' 
  AND viewname IN ('LocationSearchView', 'IntroducedByPartyView', 'SubjectSpeakerSegmentSearchView');
\echo ''

-- Check 2: LocationSearchView - verify it returns data
\echo '2. Checking LocationSearchView data...'
SELECT 
  COUNT(*) AS total_locations,
  COUNT(geojson) AS locations_with_geojson,
  COUNT(*) - COUNT(geojson) AS locations_missing_geojson
FROM "LocationSearchView";
\echo ''

\echo '   Sample data from LocationSearchView:'
SELECT id, text, LEFT(geojson::text, 50) || '...' AS geojson_preview
FROM "LocationSearchView"
LIMIT 3;
\echo ''

-- Check 3: IntroducedByPartyView - verify party data exists
\echo '3. Checking IntroducedByPartyView data...'
SELECT 
  COUNT(*) AS total_person_party_mappings,
  COUNT(DISTINCT person_id) AS unique_persons,
  COUNT(DISTINCT party_id) AS unique_parties,
  COUNT(DISTINCT city_id) AS unique_cities
FROM "IntroducedByPartyView";
\echo ''

\echo '   Sample data from IntroducedByPartyView:'
SELECT person_id, city_id, party_name
FROM "IntroducedByPartyView"
LIMIT 3;
\echo ''

-- Check 4: SubjectSpeakerSegmentSearchView - verify speaker segments
\echo '4. Checking SubjectSpeakerSegmentSearchView data...'
SELECT 
  COUNT(*) AS total_segments,
  COUNT(speaker_person_id) AS segments_with_speaker,
  COUNT(speaker_party_id) AS segments_with_party,
  COUNT(text) AS segments_with_text,
  COUNT(summary) AS segments_with_summary
FROM "SubjectSpeakerSegmentSearchView";
\echo ''

\echo '   Sample data from SubjectSpeakerSegmentSearchView:'
SELECT 
  subject_id,
  segment_id,
  speaker_person_name,
  speaker_party_name,
  LEFT(text, 50) || '...' AS text_preview
FROM "SubjectSpeakerSegmentSearchView"
WHERE speaker_party_id IS NOT NULL
LIMIT 3;
\echo ''

-- Check 5: Verify subjects can join with introduced_by party data
\echo '5. Checking Subject → IntroducedByPartyView joins...'
SELECT 
  COUNT(*) AS total_subjects_with_person,
  COUNT(ibp.party_id) AS subjects_with_party,
  COUNT(*) - COUNT(ibp.party_id) AS subjects_missing_party
FROM "Subject" s
LEFT JOIN "IntroducedByPartyView" ibp ON ibp.person_id = s."personId" AND ibp.city_id = s."cityId"
WHERE s."personId" IS NOT NULL;
\echo ''

-- Final Summary
\echo '========================================='
\echo 'Verification Complete!'
\echo '========================================='
\echo ''
\echo 'Next steps:'
\echo '  1. Review the checks above for any issues'
\echo '  2. If all checks pass, proceed with PGSync setup'
\echo '  3. See: https://github.com/schemalabz/opencouncil-tasks for deployment'
\echo ''

