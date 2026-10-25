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

-- Drop the legacy SubjectSearchView. schema.json no longer references it,
-- and CREATE OR REPLACE below does not remove old views.
DROP VIEW IF EXISTS "SubjectSearchView";
\echo '✓ Dropped legacy SubjectSearchView (if present)'
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

-- View 2: Party of the person who introduced a subject, at the meeting's date
-- Why this view? Person and Party are connected through the Role table, not directly.
-- This view gives one row per subject that has an introducer:
--   - The party is the one the person belonged to when the meeting took place, the
--     rule the subject page applies (getPartyFromRoles with the meeting date). A
--     role is active at a date when it started on or before it and ends after it,
--     the same bounds as isRoleActiveAt in src/lib/utils/roles.ts.
--   - Prefers head roles (isHead = true), then the most recent start
--   - Uses Party's cityId since Role may not have cityId when it's a party role
--
-- IMPORTANT: The primary key is `id`, the subject id, unaliased, as in
-- SubjectMetricsView. A Role or Party WAL event carries only that table's own
-- columns, so a key built from aliased columns (person_id, city_id) made every
-- Role or Party write fail with "Primary keys [...] not subset of payload data"
-- and exit the daemon. Those events now name no row of this view, so they change
-- nothing: a role change reaches a subject when the subject is next synced. A
-- change of party from a date onwards needs no resync, because the subjects
-- before that date keep the party they had.
--
-- The column set changed from (person_id, city_id, ...), which CREATE OR REPLACE
-- cannot do, so the view is dropped and created.
\echo 'Creating IntroducedByPartyView...'
DROP VIEW IF EXISTS "IntroducedByPartyView";
CREATE VIEW "IntroducedByPartyView" AS
SELECT
  s.id,
  party.party_id,
  party.party_name,
  party.party_name_en
FROM "Subject" s
INNER JOIN "CouncilMeeting" m ON m.id = s."councilMeetingId" AND m."cityId" = s."cityId"
INNER JOIN LATERAL (
  SELECT
    pa.id AS party_id,
    pa.name AS party_name,
    pa.name_en AS party_name_en
  FROM "Role" r
  INNER JOIN "Party" pa ON r."partyId" = pa.id
  WHERE r."personId" = s."personId"
    AND pa."cityId" = s."cityId"
    AND (r."startDate" IS NULL OR r."startDate" <= m."dateTime")
    AND (r."endDate" IS NULL OR r."endDate" > m."dateTime")
  ORDER BY r."isHead" DESC, r."startDate" DESC NULLS LAST
  LIMIT 1
) party ON true
WHERE s."personId" IS NOT NULL;
\echo '✓ IntroducedByPartyView created'
\echo ''

-- View 4: Speaker contributions with party details via Role
-- Why this view? This view:
--   - Resolves the speaker's party at the date of the subject's meeting, with the
--     same rule as IntroducedByPartyView
--   - Provides denormalized speaker/party info for Elasticsearch indexing
--
-- NOTE: REF links ([text](REF:TYPE:ID)) in contribution text are indexed as-is.
-- The views do not strip text. See the README FAQ on REF links for the
-- measured search impact and for the planned ingest-pipeline stripping.
--
-- IMPORTANT: Primary key column keeps original name (`id` not `contribution_id`)
-- PGSync live sync receives WAL events with base table column names. If we alias
-- `id` to `contribution_id` here, WAL still sends `id`, causing PGSync to fail with:
--   "Primary keys ['contribution_id'] not subset of payload data dict_keys(['id', ...])"
-- The rename to `contribution_id` happens in schema.json via transform.rename.
--
-- The same holds for the foreign key: PGSync resolves a SpeakerContribution event
-- to its subject by reading the key by name from the WAL row. Aliased as
-- subject_id, it was never found, so a new or edited contribution never reached
-- the index. `subjectId` keeps its base table name. The column was renamed, which
-- CREATE OR REPLACE cannot do, so the view is dropped and created.
\echo 'Creating SpeakerContributionSearchView...'
DROP VIEW IF EXISTS "SpeakerContributionSearchView";
CREATE VIEW "SpeakerContributionSearchView" AS
SELECT
  sc.id,  -- Keep as `id` for WAL compatibility; renamed to contribution_id in schema.json
  sc."subjectId",  -- Keep the base table name: PGSync routes events by it
  sc.text,
  sp.id AS speaker_person_id,
  sp.name AS speaker_person_name,
  sp.name_en AS speaker_person_name_en,
  r_party.party_id AS speaker_party_id,
  r_party.party_name AS speaker_party_name,
  r_party.party_name_en AS speaker_party_name_en
FROM "SpeakerContribution" sc
INNER JOIN "Subject" s ON s.id = sc."subjectId"
INNER JOIN "CouncilMeeting" m ON m.id = s."councilMeetingId" AND m."cityId" = s."cityId"
LEFT JOIN "Person" sp ON sc."speakerId" = sp.id
LEFT JOIN LATERAL (
  SELECT
    pa.id AS party_id,
    pa.name AS party_name,
    pa.name_en AS party_name_en
  FROM "Role" r
  INNER JOIN "Party" pa ON r."partyId" = pa.id
  WHERE r."personId" = sp.id
    AND pa."cityId" = sp."cityId"
    AND (r."startDate" IS NULL OR r."startDate" <= m."dateTime")
    AND (r."endDate" IS NULL OR r."endDate" > m."dateTime")
  ORDER BY r."isHead" DESC, r."startDate" DESC NULLS LAST
  LIMIT 1
) r_party ON true;
\echo '✓ SpeakerContributionSearchView created'
\echo ''

-- View 5: Per-subject discussion metrics
-- Why this view? A nested array costs a nested query to aggregate at search time, so the
-- contributor count and the speaking time are precomputed here as scalar columns. They feed
-- score rescoring, not search filters.
--
-- IMPORTANT: base_tables in schema.json must never name Subject, the root table. A child node
-- that claims the root table makes PGSync route Subject DELETE events as child re-syncs, and
-- deleted subjects then stay in the index. That is why SubjectSearchView was removed. This view
-- reads only the tables the aggregates come from.
--
-- contributor_count counts SpeakerContribution rows, which matches getContributionCount() in
-- src/lib/utils.ts. Both feed the same discussion signal, so they must agree. A subject that
-- predates the contribution pipeline reports zero contributors.
--
-- discussion_speaking_seconds must equal what the subject page shows, so it repeats
-- getDiscussionSecondsForSubjects in src/lib/db/subject.ts:
--   - Tagged SUBJECT_DISCUSSION utterances are the only source. The summarize task writes them
--     inside the subject transaction.
--   - Procedural segments do not count towards a discussion.
--   - A subject with no tagged utterance reports 0. HAVING COUNT(*) > 0 returns no row, and the
--     outer COALESCE turns that into 0.
-- The sum covers the tagged utterances, not the segments that contain them. So a subject that
-- the council revisits reports the time spent on it, not the span from the first mention to the
-- last, and a segment that covers two subjects gives each subject only its own part. The name
-- says "speaking" because "duration" already means a wall-clock span here (see
-- calculateMeetingDurationMs).
\echo 'Creating SubjectMetricsView...'
CREATE OR REPLACE VIEW "SubjectMetricsView" AS
SELECT
  s.id,
  (
    SELECT COUNT(*)
    FROM "SpeakerContribution" sc
    WHERE sc."subjectId" = s.id
  ) AS contributor_count,
  COALESCE(tagged.seconds, 0) AS discussion_speaking_seconds
FROM "Subject" s
LEFT JOIN LATERAL (
  SELECT COALESCE(
    SUM(u."endTimestamp" - u."startTimestamp")
      FILTER (WHERE sm.type IS NULL OR sm.type::text <> 'procedural'),
    0
  ) AS seconds
  FROM "Utterance" u
  INNER JOIN "SpeakerSegment" ss ON ss.id = u."speakerSegmentId"
  LEFT JOIN "Summary" sm ON sm."speakerSegmentId" = ss.id
  WHERE u."discussionSubjectId" = s.id
    AND u."discussionStatus"::text = 'SUBJECT_DISCUSSION'
  HAVING COUNT(*) > 0
) tagged ON true;
\echo '✓ SubjectMetricsView created'
\echo ''

-- View 6: Administrative body of the meeting a subject belongs to
-- Why this view? Subject reaches AdministrativeBody only through CouncilMeeting,
-- which PGSync cannot express as a single relationship. This view:
--   - Flattens the two-hop join into one row per meeting
--   - Casts the AdministrativeBodyType enum to text, which Elasticsearch can index
--
-- Only the type reaches the index through this view. administrative_body_id is
-- CouncilMeeting."administrativeBodyId" verbatim (the join can only reproduce it), so
-- schema.json reads that column straight off CouncilMeeting and gets normal WAL routing
-- for a meeting that moves to another body. The id column stays here because
-- validate-views.sql pairs it with the type, and because CREATE OR REPLACE VIEW cannot
-- drop a column from an existing view.
--
-- The names are not indexed: search results hydrate the full administrativeBody from
-- PostgreSQL, so indexing them would duplicate data that no query reads.
--
-- IMPORTANT: Primary key columns keep their original names (`id`, `cityId`).
-- See the note on SpeakerContributionSearchView for why WAL requires this.
\echo 'Creating MeetingAdministrativeBodyView...'
CREATE OR REPLACE VIEW "MeetingAdministrativeBodyView" AS
SELECT
  cm.id,  -- Keep as `id`/`cityId` for WAL compatibility
  cm."cityId",
  ab.id AS administrative_body_id,
  ab.type::text AS administrative_body_type
FROM "CouncilMeeting" cm
LEFT JOIN "AdministrativeBody" ab ON ab.id = cm."administrativeBodyId";
\echo '✓ MeetingAdministrativeBodyView created'
\echo ''

-- View 7: Realm of the city a subject belongs to
-- Why this view? Only to cast the Realm enum to text, which Elasticsearch can index.
-- Every other City column reaches the index as a direct column on a child node.
--
-- The index stores the realm, not an ISO country code. The realm -> country map lives in REALMS
-- in src/lib/realm.ts, and getRealmCountry() reads it. Repeating that map in SQL would make a
-- second source of truth that no test covers, so a new realm would sync a wrong or empty
-- country. A caller that wants the country resolves it from the realm in application code.
\echo 'Creating CitySearchView...'
CREATE OR REPLACE VIEW "CitySearchView" AS
SELECT
  c.id,  -- Keep as `id` for WAL compatibility
  c.realm::text AS realm
FROM "City" c;
\echo '✓ CitySearchView created'
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
    WHEN COUNT(*) = 6 THEN '   ✓ All 6 views exist'
    ELSE '   ✗ Missing views! Expected 6, found ' || COUNT(*)::text
  END AS result
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('LocationSearchView', 'IntroducedByPartyView', 'SpeakerContributionSearchView', 'SubjectMetricsView', 'MeetingAdministrativeBodyView', 'CitySearchView');
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
  COUNT(*) AS subjects_with_introducer_party,
  COUNT(DISTINCT party_id) AS unique_parties
FROM "IntroducedByPartyView";
\echo ''

\echo '   Sample data from IntroducedByPartyView:'
SELECT id, party_name
FROM "IntroducedByPartyView"
LIMIT 3;
\echo ''

-- Check 5: Verify subjects can join with introduced_by party data
\echo '5. Checking Subject → IntroducedByPartyView joins...'
SELECT 
  COUNT(*) AS total_subjects_with_person,
  COUNT(ibp.party_id) AS subjects_with_party,
  COUNT(*) - COUNT(ibp.party_id) AS subjects_missing_party
FROM "Subject" s
LEFT JOIN "IntroducedByPartyView" ibp ON ibp.id = s.id
WHERE s."personId" IS NOT NULL;
\echo ''

-- Check 6: SpeakerContributionSearchView - verify contributions
\echo '6. Checking SpeakerContributionSearchView data...'
SELECT 
  COUNT(*) AS total_contributions,
  COUNT(speaker_person_id) AS contributions_with_speaker,
  COUNT(speaker_party_id) AS contributions_with_party,
  COUNT(text) AS contributions_with_text
FROM "SpeakerContributionSearchView";
\echo ''

\echo '   Sample data from SpeakerContributionSearchView:'
SELECT
  id,
  "subjectId",
  speaker_person_name,
  speaker_party_name,
  LEFT(text, 80) || '...' AS text_preview
FROM "SpeakerContributionSearchView"
WHERE text IS NOT NULL AND text != ''
LIMIT 3;
\echo ''

-- Check 7: SubjectMetricsView - verify the discussion metrics
\echo '7. Checking SubjectMetricsView data...'
SELECT
  COUNT(*) AS total_subjects,
  COUNT(*) FILTER (WHERE contributor_count > 0) AS subjects_with_contributors,
  COUNT(*) FILTER (WHERE discussion_speaking_seconds > 0) AS subjects_with_speaking_time,
  ROUND(MAX(discussion_speaking_seconds)::numeric, 1) AS longest_discussion_seconds
FROM "SubjectMetricsView";
\echo ''

\echo '   Source of discussion_speaking_seconds:'
\echo '   (a subject reports 0 until the summarize task tags its utterances)'
SELECT
  COUNT(*) FILTER (WHERE u.n > 0) AS from_tagged_utterances,
  COUNT(*) FILTER (WHERE u.n = 0) AS no_timing_source
FROM "Subject" s
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS n FROM "Utterance" x
  WHERE x."discussionSubjectId" = s.id AND x."discussionStatus"::text = 'SUBJECT_DISCUSSION'
) u ON true;
\echo ''

-- Check 8: MeetingAdministrativeBodyView - verify administrative body resolution
\echo '8. Checking MeetingAdministrativeBodyView data...'
SELECT
  COUNT(*) AS total_meetings,
  COUNT(administrative_body_id) AS meetings_with_body,
  COUNT(*) - COUNT(administrative_body_id) AS meetings_missing_body,
  COUNT(DISTINCT administrative_body_type) AS distinct_types
FROM "MeetingAdministrativeBodyView";
\echo ''

\echo '   Meetings per administrative body type:'
SELECT
  COALESCE(administrative_body_type, '(none)') AS administrative_body_type,
  COUNT(*) AS meetings
FROM "MeetingAdministrativeBodyView"
GROUP BY 1
ORDER BY 2 DESC;
\echo ''

-- Check 9: CitySearchView - verify the realm cast
\echo '9. Checking CitySearchView data...'
SELECT
  COUNT(*) AS total_cities,
  COUNT(realm) AS cities_with_realm,
  COUNT(*) - COUNT(realm) AS cities_missing_realm
FROM "CitySearchView";
\echo ''

\echo '   Cities per realm:'
SELECT
  COALESCE(realm, '(none)') AS realm,
  COUNT(*) AS cities
FROM "CitySearchView"
GROUP BY 1
ORDER BY 2 DESC;
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

