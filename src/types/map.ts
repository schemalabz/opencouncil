/**
 * Map-specific type definitions
 * Shared across map components and API routes
 */

import { CityWithGeometry } from '@/lib/db/cities';
import { Topic } from '@prisma/client';

/**
 * City with geometry and count aggregates for map display
 */
export interface CityWithGeometryAndCounts extends CityWithGeometry {
    _count: {
        councilMeetings: number;
        petitions: number;
    };
}

/**
 * Simplified city option for filters
 */
export interface CityOption {
    id: string;
    name: string;
    name_en: string;
    meetingsCount: number;
}

/**
 * Map filter state
 */
export interface MapFiltersState {
    monthsBack: number;
    selectedTopics: Topic[];
    selectedCities: string[]; // Array of city IDs
    selectedBodyTypes: string[]; // 'council', 'committee', 'community'
}

/**
 * Subject with associated metadata for map display
 */
export interface SubjectWithGeometry {
    id: string;
    name: string;
    description: string;
    cityId: string;
    councilMeetingId: string;
    meetingDate?: string;
    meetingName?: string;
    locationText: string;
    locationType: string;
    topicName: string;
    topicColor: string;
    topicIcon?: string | null;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    geometry: GeoJSON.Geometry;
}

/**
 * Map heatmap configuration constants
 */
export const MAP_HEATMAP_CONFIG = {
    // Petition-based heatmap thresholds
    PETITION_TARGET: 50, // Number of petitions for full heatmap intensity
    MIN_HEATMAP_OPACITY: 0.1,
    MAX_HEATMAP_OPACITY: 0.4,
    HEATMAP_OPACITY_RANGE: 0.3,

    // Age-based opacity for subjects
    MIN_AGE_OPACITY: 0.2,
    MAX_AGE_OPACITY: 1.0,
    AGE_OPACITY_DECAY: 0.8,

    // Default opacity
    DEFAULT_SUBJECT_OPACITY: 0.85,
};

/**
 * Map feature click radius for mobile touch targets
 */
export const MAP_CLICK_CONFIG = {
    MOBILE_TOUCH_RADIUS: 24, // pixels
};
