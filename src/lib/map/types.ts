import type { AdministrativeBodyType } from '@prisma/client';
/**
 * Data contracts for the CivicMap component suite.
 *
 * These are the shapes the map renders — pages adapt their data sources
 * (the /api/map/subjects payload, meeting-context SubjectWithRelations,
 * city records) into these via src/lib/map/adapters.ts.
 */

/**
 * How prominently a subject renders on the map, derived from how much it
 * was actually discussed. Most council subjects are procedural ("τυπικά")
 * and barely discussed — those are 'minor'.
 */
export type ImportanceTier = 'hot' | 'normal' | 'minor';

export interface MapSubject {
    id: string;
    name: string;
    description: string | null;
    cityId: string;
    cityName: string | null;
    councilMeetingId: string;
    /** ISO datetime of the meeting where the subject was discussed */
    meetingDate: string | null;
    meetingName: string | null;
    locationText: string | null;
    adminBodyName: string | null;
    adminBodyType: AdministrativeBodyType | null;
    topicId: string | null;
    topicName: string | null;
    /** Always present — defaults to FALLBACK_TOPIC_COLOR */
    topicColor: string;
    /** Kebab-cased lucide icon name (renderers validate); null when missing */
    topicIcon: string | null;
    discussionTimeSeconds: number;
    speakerCount: number;
    importance: ImportanceTier;
    /** GeoJSON geometry with normalized [lng, lat] positions; null for subjects without a location */
    geometry: GeoJSON.Geometry | null;
    /**
     * Representative point ([lng, lat]) — the geometry's coordinates for
     * Points, its bbox center otherwise. This is what gets clustered/pinned.
     * null = no location: the subject lists with its municipality but never
     * renders on the map.
     */
    anchor: [number, number] | null;
}

export interface MapMunicipality {
    id: string;
    name: string;
    name_municipality: string;
    logoImage: string | null;
    officialSupport: boolean;
    supportsNotifications: boolean;
    meetingsCount: number;
    petitionCount: number;
    geometry: GeoJSON.Geometry | null;
}

/**
 * A quiet styled geometry drawn under the subject layers (city boundaries,
 * notification radii, …). Display only — never clustered, never clickable.
 * Point data belongs in referenceMarkers or subjects instead.
 */
export interface MapOverlay {
    id: string;
    geometry: GeoJSON.Geometry;
    style?: {
        fillColor?: string;
        fillOpacity?: number;
        strokeColor?: string;
        strokeWidth?: number;
        strokeOpacity?: number;
        label?: string;
    };
}

/** A labeled reference dot (search result, user-picked location, …). */
export interface MapReferenceMarker {
    id: string;
    coordinates: [number, number];
    label?: string;
    color?: string;
}

/**
 * Wire shape of map subjects as returned by getMapSubjects() and the
 * /api/map/subjects route.
 */
export interface MapSubjectsApiItem {
    id: string;
    name: string;
    description: string | null;
    cityId: string;
    cityName?: string | null;
    councilMeetingId: string;
    meetingDate?: string | null;
    meetingName?: string | null;
    locationText?: string | null;
    adminBodyName?: string | null;
    adminBodyType?: AdministrativeBodyType | null;
    topicId?: string | null;
    topicName?: string | null;
    topicColor?: string | null;
    topicIcon?: string | null;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    geometry: GeoJSON.Geometry | null;
}
