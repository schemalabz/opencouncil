import { City, CouncilMeeting } from "@prisma/client";
import { SubjectWithRelations } from "@/lib/db/subject";
import { SegmentWithRelations } from "@/lib/db/speakerSegments";

// Search configuration
export type SearchConfig = {
    enableSemanticSearch?: boolean;
    enableHighlights?: boolean;
    size?: number;
    from?: number;
    rankWindowSize?: number;
    rankConstant?: number;
    detailed?: boolean; // Whether to return detailed results
};

// Location type for search
export type Location = {
    point: {
        lat: number;
        lon: number;
    };
    radius: number;
};

// Search request type
export type SearchRequest = {
    query: string;
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
    matchedSpeakerSegmentIds?: string[];
    councilMeeting: CouncilMeeting & {
        city: City;
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
    total: number;
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
    public_subject_id: string;
    public_subject_name: string;
    public_subject_description: string;
    public_subject_location_text: string;
}
