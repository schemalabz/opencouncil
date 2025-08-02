/**
 * Elasticsearch Sync Query Template
 * 
 * This template contains the SQL query used for syncing data from PostgreSQL to Elasticsearch.
 * The {{CITY_IDS}} placeholder is replaced with actual city IDs at runtime.
 * 
 * Note: This query uses the updated schema with Role-based party relationships
 * (Person -> Role -> Party instead of direct Person -> Party)
 */

export const SYNC_QUERY_TEMPLATE = `
SELECT
          s.*,
          l.text AS location_text,
          ST_AsGeoJSON(l.coordinates)::jsonb AS location_geojson,
          t.id AS topic_id, t.name AS topic_name, t.name_en AS topic_name_en,
          p.id AS introduced_by_person_id, p.name AS introduced_by_person_name, p.name_en AS introduced_by_person_name_en,
          pa.id AS introduced_by_party_id, pa.name AS introduced_by_party_name, pa.name_en AS introduced_by_party_name_en,
          c.id AS city_id, c.name AS city_name, c.name_en AS city_name_en,
          m.id AS councilMeeting_id, m."dateTime" AS meeting_date, m.name AS meeting_name,
          COALESCE(
            json_agg(
              jsonb_build_object(
                'segment_id', ss.id,
                'speaker', jsonb_build_object(
                  'person_id', sp.id,
                  'person_name', sp.name,
                  'person_name_en', sp.name_en,
                  'party_id', spa.id,
                  'party_name', spa.name,
                  'party_name_en', spa.name_en
                ),
                'text', u.utterances_text,
                'summary', sss.summary
              )
            ) FILTER (WHERE ss.id IS NOT NULL), '[]'
          ) AS speaker_segments
        FROM "Subject" s
        LEFT JOIN "Location" l ON s."locationId" = l.id
        LEFT JOIN "Topic" t ON s."topicId" = t.id
        LEFT JOIN "Person" p ON s."personId" = p.id
        LEFT JOIN LATERAL (
          SELECT r."partyId", r."cityId"
          FROM "Role" r
          WHERE r."personId" = p.id 
            AND r."partyId" IS NOT NULL
            AND (
              -- Active role: handle all combinations of start/end dates
              (r."startDate" IS NULL AND r."endDate" IS NULL) OR
              (r."startDate" IS NULL AND r."endDate" > NOW()) OR
              (r."startDate" <= NOW() AND r."endDate" IS NULL) OR
              (r."startDate" <= NOW() AND r."endDate" > NOW())
            )
          ORDER BY r."createdAt" DESC
          LIMIT 1
        ) pr ON true
        LEFT JOIN "Party" pa ON pr."partyId" = pa.id
        LEFT JOIN "City" c ON s."cityId" = c.id
        LEFT JOIN "CouncilMeeting" m ON s."councilMeetingId" = m.id AND s."cityId" = m."cityId"
        LEFT JOIN "SubjectSpeakerSegment" sss ON sss."subjectId" = s.id
        LEFT JOIN "SpeakerSegment" ss ON ss.id = sss."speakerSegmentId"
        LEFT JOIN "SpeakerTag" st ON ss."speakerTagId" = st.id
        LEFT JOIN "Person" sp ON st."personId" = sp.id
        LEFT JOIN LATERAL (
          SELECT r."partyId", r."cityId"
          FROM "Role" r
          WHERE r."personId" = sp.id 
            AND r."partyId" IS NOT NULL
            AND (
              -- Active role: handle all combinations of start/end dates
              (r."startDate" IS NULL AND r."endDate" IS NULL) OR
              (r."startDate" IS NULL AND r."endDate" > NOW()) OR
              (r."startDate" <= NOW() AND r."endDate" IS NULL) OR
              (r."startDate" <= NOW() AND r."endDate" > NOW())
            )
          ORDER BY r."createdAt" DESC
          LIMIT 1
        ) spr ON true
        LEFT JOIN "Party" spa ON spr."partyId" = spa.id
        LEFT JOIN LATERAL (
          SELECT
            string_agg(u.text, ' ' ORDER BY u."startTimestamp") AS utterances_text
          FROM "Utterance" u
          WHERE u."speakerSegmentId" = ss.id
        ) u ON true
        WHERE m."cityId" IN ({{CITY_IDS}}) AND m."released" = true
        GROUP BY
          s.id, l.text, l.coordinates, t.id, t.name, t.name_en,
          p.id, p.name, p.name_en, pa.id, pa.name, pa.name_en,
          c.id, c.name, c.name_en, m.id, m."dateTime", m.name
`;

/**
 * Builds the sync query by replacing the {{CITY_IDS}} placeholder with actual city IDs
 * 
 * @param cityIds Array of city IDs to include in the sync
 * @returns Complete SQL query ready for execution
 */
export function buildSyncQuery(cityIds: string[]): string {
  if (cityIds.length === 0) {
    throw new Error('At least one city ID must be provided');
  }
  
  // Escape single quotes and wrap each city ID in single quotes
  const cityList = cityIds
    .map(id => `'${id.replace(/'/g, "''")}'`)
    .join(', ');
    
  return SYNC_QUERY_TEMPLATE.replace('{{CITY_IDS}}', cityList);
}

/**
 * Extracts city IDs from a sync query string
 * Used to parse existing connector configurations
 * 
 * @param query SQL query string
 * @returns Array of city IDs found in the query
 */
export function extractCityIdsFromQuery(query: string): string[] {
  // Extract city IDs from WHERE clause using regex
  const match = query.match(/WHERE m\."cityId" IN \((.*?)\)/);
  if (!match) return [];
  
  return match[1]
    .split(',')
    .map(id => id.trim().replace(/'/g, ''))
    .filter(id => id.length > 0);
}

/**
 * Normalizes a query by replacing city IDs with a placeholder for comparison
 * This allows us to compare query structure without being affected by different city lists
 * 
 * @param query SQL query string
 * @returns Normalized query with placeholder
 */
export function normalizeQueryForComparison(query: string): string {
  // Replace the city IDs list with a placeholder
  return query
    .replace(/WHERE m\."cityId" IN \([^)]*\)/, 'WHERE m."cityId" IN ({{CITY_IDS}})')
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Compares two SQL queries to see if they have the same structure
 * Ignores differences in city ID lists and whitespace
 * 
 * @param query1 First query to compare
 * @param query2 Second query to compare
 * @returns True if queries have the same structure
 */
export function compareQueryStructure(query1: string, query2: string): boolean {
  const normalized1 = normalizeQueryForComparison(query1);
  const normalized2 = normalizeQueryForComparison(query2);
  
  return normalized1 === normalized2;
}

/**
 * Validates that a remote query matches our expected template structure
 * 
 * @param remoteQuery The query from the Elasticsearch connector
 * @param expectedCityIds The city IDs we expect to be in the query
 * @returns Validation result with details about any mismatches
 */
export function validateQueryStructure(remoteQuery: string, expectedCityIds: string[]) {
  const expectedQuery = buildSyncQuery(expectedCityIds);
  const actualCityIds = extractCityIdsFromQuery(remoteQuery);
  
  // Check if query structures match
  const structureMatches = compareQueryStructure(remoteQuery, expectedQuery);
  
  // Check if city IDs match
  const cityIdsMatch = JSON.stringify(actualCityIds.sort()) === JSON.stringify(expectedCityIds.sort());
  
  return {
    structureMatches,
    cityIdsMatch,
    actualCityIds,
    expectedCityIds,
    remoteQuery,
    expectedQuery,
    isValid: structureMatches && cityIdsMatch
  };
} 