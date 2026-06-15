-- ============================================================================
-- Elasticsearch View Validation
-- ============================================================================
-- This script validates that all PGSync views are working correctly.
-- Run after creating views with: psql "$PSQL_URL" < elasticsearch/validate-views.sql
-- ============================================================================

\echo ''
\echo '========================================='
\echo 'Validating Elasticsearch PGSync Views'
\echo '========================================='
\echo ''

-- ============================================================================
-- 1. Check all views exist
-- ============================================================================
\echo '1. Checking all required views exist...'
SELECT
  viewname,
  CASE WHEN viewname IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    'LocationSearchView',
    'IntroducedByPartyView',
    'SubjectSpeakerSegmentSearchView',
    'SpeakerContributionSearchView'
  )
ORDER BY viewname;

\echo ''

-- ============================================================================
-- 2. Validate SpeakerContributionSearchView - party resolution
-- ============================================================================
\echo '2. Validating SpeakerContributionSearchView...'
SELECT
  COUNT(*) AS total_contributions,
  COUNT(speaker_person_id) AS with_speaker,
  COUNT(speaker_party_id) AS with_party,
  COUNT(text) AS with_text
FROM "SpeakerContributionSearchView";

\echo ''
\echo '   Sample contributions (first 3):'
SELECT
  id,
  speaker_person_name,
  speaker_party_name,
  LEFT(text, 80) || CASE WHEN LENGTH(text) > 80 THEN '...' ELSE '' END AS text_preview
FROM "SpeakerContributionSearchView"
WHERE text IS NOT NULL AND text != ''
LIMIT 3;

\echo ''

-- ============================================================================
-- 3. Validate SubjectSpeakerSegmentSearchView - party resolution
-- ============================================================================
\echo '3. Validating SubjectSpeakerSegmentSearchView...'
SELECT
  COUNT(*) AS total_segments,
  COUNT(speaker_person_id) AS with_speaker,
  COUNT(speaker_party_id) AS with_party,
  COUNT(text) AS with_text,
  COUNT(summary) AS with_summary
FROM "SubjectSpeakerSegmentSearchView";

\echo ''

-- ============================================================================
-- 4. Validate IntroducedByPartyView - party resolution
-- ============================================================================
\echo '4. Validating IntroducedByPartyView...'
SELECT
  COUNT(*) AS total_mappings,
  COUNT(DISTINCT person_id) AS unique_persons,
  COUNT(DISTINCT party_id) AS unique_parties,
  COUNT(DISTINCT city_id) AS unique_cities
FROM "IntroducedByPartyView";

\echo ''

-- ============================================================================
-- 5. Validate LocationSearchView - GeoJSON conversion
-- ============================================================================
\echo '5. Validating LocationSearchView...'
SELECT
  COUNT(*) AS total_locations,
  COUNT(geojson) AS with_geojson,
  COUNT(*) - COUNT(geojson) AS missing_geojson
FROM "LocationSearchView";

\echo ''

-- ============================================================================
-- Summary
-- ============================================================================
\echo '========================================='
\echo 'Validation Complete'
\echo '========================================='
\echo ''
\echo 'If counts look reasonable, the views are ready for PGSync.'
\echo ''
