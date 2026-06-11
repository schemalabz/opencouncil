/**
 * Data types and helpers for the landing redesign — thin client-side view models
 * over the real APIs:
 *   GET /api/map/subjects      → MapSubject[]   (geo-located subjects, last 6 months)
 *   GET /api/cities            → LandingCity[]  (listed cities with counts)
 *   GET /api/meetings/upcoming → UpcomingMeeting[]
 *   GET /api/topics            → Topic[]        (via useTopics())
 */

/** Row returned by GET /api/map/subjects (see src/app/api/map/subjects/route.ts). */
export type MapSubject = {
    id: string;
    name: string;
    description: string;
    cityId: string;
    councilMeetingId: string;
    meetingDate?: string;
    meetingName?: string;
    locationText?: string;
    locationType?: string;
    topicId?: string | null;
    topicName?: string;
    topicColor: string;
    topicIcon?: string | null;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    geometry: GeoJSON.Geometry;
};

/** Subset of GET /api/cities (CityWithCounts, JSON-serialized) that the landing uses. */
export type LandingCity = {
    id: string;
    name: string;
    name_en: string;
    name_municipality: string;
    logoImage: string | null;
    _count: { persons: number; parties: number; councilMeetings: number };
};

/** Subset of GET /api/meetings/upcoming (UpcomingMeetingWithCity, JSON-serialized). */
export type UpcomingMeeting = {
    id: string;
    cityId: string;
    name: string;
    dateTime: string;
    city: { id: string; name: string; name_municipality: string; logoImage: string | null };
    administrativeBody: { name: string } | null;
};

/** The topic accent shown on chips, pins and cards. */
export type SubjectTopic = { name: string; color: string; icon: string | null };

/** Display model for one geo-located subject on the landing map/lists. */
export type LandingSubject = {
    id: string;
    title: string;
    summary: string;
    cityId: string;
    cityName: string;
    meetingId: string;
    lat: number;
    lng: number;
    /** meeting date as ISO string (missing for unscheduled data) */
    date: string | null;
    /** the street/area the subject refers to (Location.text) */
    where: string;
    topicId: string | null;
    topic: SubjectTopic;
    durationMin: number;
    speakers: number;
    /** among the most-discussed subjects → bigger pin, flame tag */
    hot: boolean;
    href: string;
};

/** How many of the most-discussed subjects get the "πολυσυζητημένο" treatment. */
const HOT_COUNT = 3;

export function toLandingSubjects(rows: MapSubject[], cityNames: Record<string, string>): LandingSubject[] {
    const subjects = rows
        .filter((s) => s.geometry?.type === 'Point')
        .map((s) => {
            const [lng, lat] = (s.geometry as GeoJSON.Point).coordinates;
            return {
                id: s.id,
                title: s.name,
                summary: s.description,
                cityId: s.cityId,
                cityName: cityNames[s.cityId] ?? s.cityId,
                meetingId: s.councilMeetingId,
                lat,
                lng,
                date: s.meetingDate ?? null,
                where: s.locationText ?? '',
                topicId: s.topicId ?? null,
                topic: { name: s.topicName ?? 'Γενικά', color: s.topicColor, icon: s.topicIcon ?? null },
                durationMin: Math.round((s.discussionTimeSeconds ?? 0) / 60),
                speakers: s.speakerCount ?? 0,
                hot: false,
                href: `/${s.cityId}/${s.councilMeetingId}/subjects/${s.id}`,
            };
        });

    [...subjects]
        .sort((a, b) => b.durationMin - a.durationMin)
        .slice(0, HOT_COUNT)
        .forEach((s) => {
            if (s.durationMin > 0) s.hot = true;
        });

    return subjects;
}

/** Popular free-text searches shown as suggestions when the search field is focused. */
export const SEARCH_KEYWORDS = [
    'Προϋπολογισμός',
    'Στάθμευση',
    'Πεζοδρόμηση',
    'Πράσινο & δέντρα',
    'Λαϊκές αγορές',
    'Αντιπλημμυρικά',
    'Σχολεία',
    'Καθαριότητα',
];
