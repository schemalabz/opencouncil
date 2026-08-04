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
    'SpeakerContributionSearchView',
    'SubjectMetricsView',
    'MeetingAdministrativeBodyView',
    'CitySearchView'
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
-- 3. Validate IntroducedByPartyView - party resolution
-- ============================================================================
\echo '3. Validating IntroducedByPartyView...'
SELECT
  COUNT(*) AS total_mappings,
  COUNT(DISTINCT person_id) AS unique_persons,
  COUNT(DISTINCT party_id) AS unique_parties,
  COUNT(DISTINCT city_id) AS unique_cities
FROM "IntroducedByPartyView";

\echo ''

-- ============================================================================
-- 4. Validate LocationSearchView - GeoJSON conversion
-- ============================================================================
\echo '4. Validating LocationSearchView...'
SELECT
  COUNT(*) AS total_locations,
  COUNT(geojson) AS with_geojson,
  COUNT(*) - COUNT(geojson) AS missing_geojson
FROM "LocationSearchView";

\echo ''

-- ============================================================================
-- 5. Validate SubjectMetricsView - discussion metrics
-- ============================================================================
\echo '5. Validating SubjectMetricsView (discussion metrics)...'
SELECT
  COUNT(*) AS total_subjects,
  COUNT(CASE WHEN contributor_count IS NULL OR discussion_speaking_seconds IS NULL THEN 1 END) AS null_metrics,
  COUNT(CASE WHEN contributor_count < 0 OR discussion_speaking_seconds < 0 THEN 1 END) AS negative_metrics,
  CASE
    WHEN COUNT(CASE WHEN contributor_count IS NULL OR discussion_speaking_seconds IS NULL THEN 1 END) > 0
      THEN 'FAIL: Metrics must never be NULL'
    WHEN COUNT(CASE WHEN contributor_count < 0 OR discussion_speaking_seconds < 0 THEN 1 END) > 0
      THEN 'FAIL: Negative metrics found'
    ELSE 'PASS: Metrics are non-null and non-negative'
  END AS validation_result
FROM "SubjectMetricsView";

\echo ''
\echo '   Checking the speaking time reads the current source (tagged utterances)...'
-- The regression this catches: the view stops reading tagged utterances, so every subject
-- reports 0 seconds.
WITH tagged AS (
  SELECT u."discussionSubjectId" AS id,
         SUM(u."endTimestamp" - u."startTimestamp")
           FILTER (WHERE sm.type IS NULL OR sm.type::text <> 'procedural') AS seconds
  FROM "Utterance" u
  INNER JOIN "SpeakerSegment" ss ON ss.id = u."speakerSegmentId"
  LEFT JOIN "Summary" sm ON sm."speakerSegmentId" = ss.id
  WHERE u."discussionStatus"::text = 'SUBJECT_DISCUSSION'
    AND u."discussionSubjectId" IS NOT NULL
  GROUP BY 1
)
SELECT
  COUNT(*) AS subjects_with_tagged_time,
  COUNT(CASE WHEN v.discussion_speaking_seconds = 0 THEN 1 END) AS reporting_zero,
  CASE
    WHEN COUNT(*) = 0
      THEN 'SKIP: No tagged utterances in this database'
    WHEN COUNT(CASE WHEN v.discussion_speaking_seconds = 0 THEN 1 END) > 0
      THEN 'FAIL: Subjects with tagged discussion time report 0 seconds'
    ELSE 'PASS: Speaking time follows the tagged utterances'
  END AS validation_result
FROM tagged
INNER JOIN "SubjectMetricsView" v ON v.id = tagged.id
WHERE tagged.seconds > 0;

\echo ''

-- ============================================================================
-- 6. Validate MeetingAdministrativeBodyView - two-hop join and enum cast
-- ============================================================================
\echo '6. Validating MeetingAdministrativeBodyView...'
-- The expected values come from pg_enum, not a hardcoded list, so a new AdministrativeBodyType
-- flows through the cast on its own instead of failing this check.
SELECT
  COUNT(*) AS total_meetings,
  COUNT(administrative_body_id) AS with_body,
  COUNT(*) - COUNT(administrative_body_id) AS without_body,
  CASE
    WHEN COUNT(CASE WHEN administrative_body_id IS NOT NULL AND administrative_body_type IS NULL THEN 1 END) > 0
      THEN 'FAIL: Body present but type missing'
    WHEN COUNT(CASE WHEN administrative_body_type NOT IN (
      SELECT e.enumlabel FROM pg_enum e
      INNER JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AdministrativeBodyType'
    ) THEN 1 END) > 0
      THEN 'FAIL: Type outside the AdministrativeBodyType enum'
    ELSE 'PASS: Types resolve correctly'
  END AS validation_result
FROM "MeetingAdministrativeBodyView";

\echo ''

-- ============================================================================
-- 7. Validate CitySearchView - realm enum cast
-- ============================================================================
\echo '7. Validating CitySearchView...'
-- The expected values come from pg_enum, not from a hardcoded list. A new realm must
-- flow through the cast on its own, so this check must not fail when someone adds one.
SELECT
  COUNT(*) AS total_cities,
  COUNT(realm) AS with_realm,
  CASE
    WHEN COUNT(*) - COUNT(realm) > 0
      THEN 'FAIL: Realm must never be NULL'
    WHEN COUNT(CASE WHEN realm NOT IN (
      SELECT e.enumlabel FROM pg_enum e
      INNER JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'Realm'
    ) THEN 1 END) > 0
      THEN 'FAIL: Realm outside the Realm enum'
    ELSE 'PASS: Realms cast to text correctly'
  END AS validation_result
FROM "CitySearchView";

\echo ''
\echo '   Cities per realm:'
SELECT
  realm,
  COUNT(*) AS cities
FROM "CitySearchView"
GROUP BY 1
ORDER BY 2 DESC;

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
