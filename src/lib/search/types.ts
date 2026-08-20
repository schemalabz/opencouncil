import { AdministrativeBody, City, CouncilMeeting } from "@prisma/client";
import { SubjectWithRelations } from "@/lib/db/subject";
import { SegmentWithRelations } from "@/lib/db/speakerSegments";

// Search configuration
export type SearchConfig = {
    enableSemanticSearch?: boolean;
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
     *  (buildLocationBoostClauses) sit in different files; an unlabelled
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
};

// Extracted filters from query
export interface ExtractedFilters {
    cityIds: string[] | null;
    dateRange: {
        start: string;
        end: string;
    } | null;
    isLatest: boolean | null;
    locationName: string | null;
}

// Elasticsearch document type
export interface SubjectDocument {
    id: string;
    name: string;
    description: string;
    location_text: string;
}
