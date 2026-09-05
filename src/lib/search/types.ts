import { AdministrativeBody, AdministrativeBodyType, City, CouncilMeeting } from "@prisma/client";
import { SubjectWithRelations } from "@/lib/db/subject";
import { SegmentWithRelations } from "@/lib/db/speakerSegments";

// Search configuration
export type SearchConfig = {
    enableSemanticSearch?: boolean;
    /** Read city, date and location filters out of the query text with a model,
     *  for callers whose whole query is one free-text box. On by default.
     *  Turn it off when the caller already knows its filters: the derivation
     *  costs a model call, plus a geocode for every candidate city when the
     *  query names a place. */
    extractFilters?: boolean;
    /** Similarity cutoff (normalized cosine, 0-1) for the semantic fallback.
     *  See DEFAULT_SEMANTIC_MIN_SCORE. */
    semanticMinScore?: number;
    enableHighlights?: boolean;
    size?: number;
    from?: number;
    detailed?: boolean; // Whether to return detailed results
};

// Location type for search
export type Location = {
    point: {
        lat: number;
        lon: number;
    };
    /** Proximity-boost radius in METRES. The name carries the unit because the
     *  only producer (resolveLocationCoordinates) and the only consumer
     *  (buildLocationClauses) sit in different files; an unlabelled
     *  `radius` let the consumer read metres as kilometres. */
    radiusMeters: number;
};

// Search request type
export type SearchRequest = {
    /** Free-text query. When omitted/empty, the search is filter-only: results
     *  match the filters below and are sorted by meeting date (newest first). */
    query?: string;
    cityIds?: string[];
    personIds?: string[];
    partyIds?: string[];
    /** Named administrative bodies of the meeting a subject belongs to. */
    adminBodyIds?: string[];
    /** Every administrative body of these types (every committee, for example). */
    adminBodyTypes?: AdministrativeBodyType[];
    topicIds?: string[];
    dateRange?: {
        start: string;
        end: string;
    };
    locations?: Location[];
    config?: SearchConfig;
};

// Lightweight search result
export type SearchResultLight = SubjectWithRelations & {
    score: number;
    // Highlight fragments (full field, matched terms wrapped in HIGHLIGHT_START/END
    // sentinel tags). Present only when config.enableHighlights is set.
    nameHighlight?: string;
    descriptionHighlight?: string;
    councilMeeting: CouncilMeeting & {
        city: City;
        administrativeBody: AdministrativeBody | null;
    };
};

// Detailed search result with speaker segment text
export type SearchResultDetailed = SearchResultLight & {
    speakerSegments: SegmentWithRelations[];
    context?: string;
};

/**
 * The filters the search read out of the query text, because the caller had not
 * set them. Empty when extraction is off, or when it found nothing.
 *
 * A caller that shows filters on screen must show these too. Extraction that
 * narrows a search invisibly leaves the results disagreeing with the controls
 * next to them, and the reader has nothing to correct.
 */
export type DerivedFilters = {
    cityIds?: string[];
    dateRange?: { start: string; end: string };
    locations?: Location[];
};

// Search response type
export type SearchResponse = {
    results: SearchResultLight[] | SearchResultDetailed[];
    /** ES total minus this page's drops — approximate while the index is stale
     *  (other pages may hold more drops). See `dropped`. */
    total: number;
    /** Hits ES returned for this page that hydration dropped (orphaned, stale
     *  unreleased, or source-less). When > 0, `total` may still count hidden
     *  matches on other pages — callers that must not leak the existence of
     *  non-public content should omit the total instead of reporting it. */
    dropped: number;
    /** What the query text supplied that the caller had not. See DerivedFilters. */
    derivedFilters: DerivedFilters;
};

// Extracted filters from query
export interface ExtractedFilters {
    cityIds: string[] | null;
    dateRange: {
        start: string;
        end: string;
    } | null;
    locationName: string | null;
}

// Elasticsearch document type
export interface SubjectDocument {
    id: string;
    name: string;
    description: string;
    location_text: string;
}
