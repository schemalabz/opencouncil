import { calculateGeometryBounds, normalizeGeometryCoordinates, normalizeLngLat } from '@/lib/geo';
import { FALLBACK_TOPIC_COLOR } from './constants';
import { deriveImportanceTier } from './importance';
import type { MapMunicipality, MapSubject, MapSubjectsApiItem } from './types';

/**
 * Normalizes a lucide icon name to its kebab-case form ("Building2" →
 * "building-2"). Topic icons are stored kebab-case in production but
 * PascalCase in older seed data. Purely syntactic — renderers validate
 * against the actual lucide registry (see src/components/icon.tsx) and
 * fall back when a name doesn't exist.
 */
export function normalizeIconName(icon: string | null | undefined): string | null {
    if (!icon) return null;
    return icon
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
        .toLowerCase();
}

function geometryAnchor(geometry: GeoJSON.Geometry): [number, number] {
    if (geometry.type === 'Point') {
        return [geometry.coordinates[0], geometry.coordinates[1]];
    }
    return calculateGeometryBounds(geometry).center;
}

/** Adapts a getMapSubjects() / /api/map/subjects item into a MapSubject. */
export function apiSubjectToMapSubject(item: MapSubjectsApiItem): MapSubject {
    const geometry = normalizeGeometryCoordinates(item.geometry);
    const discussionTimeSeconds = item.discussionTimeSeconds ?? 0;
    const speakerCount = item.speakerCount ?? 0;
    return {
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        cityId: item.cityId,
        cityName: item.cityName ?? null,
        councilMeetingId: item.councilMeetingId,
        meetingDate: item.meetingDate ?? null,
        meetingName: item.meetingName ?? null,
        locationText: item.locationText ?? null,
        topicId: item.topicId ?? null,
        topicName: item.topicName ?? null,
        topicColor: item.topicColor || FALLBACK_TOPIC_COLOR,
        topicIcon: normalizeIconName(item.topicIcon),
        discussionTimeSeconds,
        speakerCount,
        importance: deriveImportanceTier(discussionTimeSeconds, speakerCount),
        geometry,
        anchor: geometryAnchor(geometry),
    };
}

/**
 * Structural subset of SubjectWithRelations (+ statistics) that the meeting
 * adapter needs — kept structural so src/lib/map has no dependency on the
 * db layer and tests don't have to build full relation fixtures.
 */
export interface MeetingSubjectLike {
    id: string;
    name: string;
    description: string;
    cityId: string;
    councilMeetingId: string;
    topicId?: string | null;
    topic: { id: string; name: string; colorHex: string; icon: string | null } | null;
    location: { text: string; coordinates?: { x: number; y: number } } | null;
    statistics?: { speakingSeconds: number; people?: readonly unknown[] } | null;
}

export interface MeetingSubjectContext {
    cityName?: string | null;
    meetingDate?: Date | string | null;
    meetingName?: string | null;
}

/**
 * Adapts a meeting-context subject (SubjectWithRelations & { statistics })
 * into a MapSubject. Returns null when the subject has no usable location.
 */
export function subjectWithRelationsToMapSubject(
    subject: MeetingSubjectLike,
    context: MeetingSubjectContext = {},
): MapSubject | null {
    const coordinates = subject.location?.coordinates;
    if (!coordinates) return null;

    // ST_X/ST_Y of legacy rows can be axis-swapped; normalize defensively.
    const anchor = normalizeLngLat([coordinates.x, coordinates.y]);
    const discussionTimeSeconds = Math.round(subject.statistics?.speakingSeconds ?? 0);
    const speakerCount = subject.statistics?.people?.length ?? 0;
    const meetingDate = context.meetingDate instanceof Date
        ? context.meetingDate.toISOString()
        : context.meetingDate ?? null;

    return {
        id: subject.id,
        name: subject.name,
        description: subject.description ?? null,
        cityId: subject.cityId,
        cityName: context.cityName ?? null,
        councilMeetingId: subject.councilMeetingId,
        meetingDate,
        meetingName: context.meetingName ?? null,
        locationText: subject.location?.text ?? null,
        topicId: subject.topicId ?? subject.topic?.id ?? null,
        topicName: subject.topic?.name ?? null,
        topicColor: subject.topic?.colorHex || FALLBACK_TOPIC_COLOR,
        topicIcon: normalizeIconName(subject.topic?.icon),
        discussionTimeSeconds,
        speakerCount,
        importance: deriveImportanceTier(discussionTimeSeconds, speakerCount),
        geometry: { type: 'Point', coordinates: anchor },
        anchor,
    };
}

/** Structural subset of a city record needed for the municipalities layer. */
export interface CityLikeForMap {
    id: string;
    name: string;
    name_municipality: string;
    logoImage: string | null;
    officialSupport: boolean;
    supportsNotifications: boolean;
    geometry?: GeoJSON.Geometry | null;
    _count?: { councilMeetings: number };
}

export function cityToMapMunicipality(city: CityLikeForMap, petitionCount: number): MapMunicipality {
    return {
        id: city.id,
        name: city.name,
        name_municipality: city.name_municipality,
        logoImage: city.logoImage,
        officialSupport: city.officialSupport,
        supportsNotifications: city.supportsNotifications,
        meetingsCount: city._count?.councilMeetings ?? 0,
        petitionCount,
        geometry: city.geometry ?? null,
    };
}
