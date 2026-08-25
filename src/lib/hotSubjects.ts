import { AdministrativeBodyType } from '@prisma/client';
import { createCache, getCouncilMeetingsForCityPublicCached } from '@/lib/cache';
import { getCouncilMeetingsForCity, type CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { getContributionCount } from '@/lib/utils';
import { sortByRanking, type RankableSubject } from '@/lib/ranking/subjects';
import { filterLocationIdsWithinRadius, getLocationDistancesFromPoint } from '@/lib/db/location';
import { decodeGeohashToCenter } from '@/lib/geo';

/** Recent past meetings to draw "hot" subjects from. */
const HOT_MEETING_WINDOW = 8;
/** Radius (m) around the geohash cell center for the location-filtered variant. */
const GEO_RADIUS_METERS = 500;
/** Bump when the ranking/selection logic changes so cached results don't go stale. */
const GEO_CACHE_VERSION = 'v2';

type Meeting = CouncilMeetingWithAdminBodyAndSubjects;
export type HotSubject = { subject: Meeting['subjects'][number]; meeting: Meeting };

interface BodyFilter {
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
}

/**
 * Every subject of the given meetings, minus the ones that cannot be "hot".
 *
 * A subject nobody spoke to has no claim on a list of what was discussed, and a
 * withdrawn one was pulled before it could be. Both would otherwise rank on
 * recency alone, so a single freshly-released meeting can put an untouched
 * agenda item at the top — and with zero discussion time behind it, every
 * comparison drawn against it collapses.
 */
function flatten(meetings: Meeting[]): HotSubject[] {
    return meetings.flatMap(meeting =>
        meeting.subjects
            .filter(subject => !subject.withdrawn && getContributionCount(subject) > 0)
            .map(subject => ({ subject, meeting })),
    );
}

function adapt(item: HotSubject): RankableSubject {
    return {
        cityId: item.meeting.cityId,
        meetingDate: item.meeting.dateTime,
        discussionSignal: getContributionCount(item.subject),
        adminBodyType: item.meeting.administrativeBody?.type ?? null,
        // Weak location tiebreaker in the non-geo widget; a no-op within the
        // geo variant's homogeneous near/wide groups.
        hasLocation: item.subject.locationId != null,
    };
}

/** Recent hottest subjects across a city's recent past meetings (no location filter). */
export async function getRecentHotSubjects(
    cityId: string,
    { limit, administrativeBodyTypes, administrativeBodyIds }: BodyFilter & { limit: number }
): Promise<HotSubject[]> {
    const meetings = await getCouncilMeetingsForCityPublicCached(cityId, {
        limit: HOT_MEETING_WINDOW, administrativeBodyTypes, administrativeBodyIds, timeFilter: 'past',
    });
    return sortByRanking(flatten(meetings), adapt).slice(0, limit);
}

async function rankSubjectsNearPoint(
    meetings: Meeting[],
    center: [number, number],
    radiusMeters: number,
    limit: number
): Promise<HotSubject[]> {
    const candidates = flatten(meetings);
    const locatedIds = candidates
        .map(c => c.subject.locationId)
        .filter((id): id is string => id != null);
    const nearby = new Set(await filterLocationIdsWithinRadius(locatedIds, center, radiusMeters));

    // Location-targeted ordering: subjects within the radius come first
    // (that's the whole point of asking near a point), then municipality-wide
    // (no-location) subjects fill any remaining slots. Each group is ranked on
    // its own by the standard recency/discussion blend.
    const near = candidates.filter(c => c.subject.locationId != null && nearby.has(c.subject.locationId));
    const wide = candidates.filter(c => c.subject.locationId == null);
    return [...sortByRanking(near, adapt), ...sortByRanking(wide, adapt)].slice(0, limit);
}

async function computeHotSubjectsNearGeohash(
    cityId: string,
    geohash: string,
    { limit, administrativeBodyTypes, administrativeBodyIds }: BodyFilter & { limit: number }
): Promise<HotSubject[]> {
    // Called inside the cached wrapper below — use the uncached meetings query so
    // we don't nest unstable_cache calls.
    const meetings = await getCouncilMeetingsForCity(cityId, {
        includeUnreleased: false, limit: HOT_MEETING_WINDOW, administrativeBodyTypes, administrativeBodyIds, timeFilter: 'past',
    });
    try {
        return await rankSubjectsNearPoint(meetings, decodeGeohashToCenter(geohash), GEO_RADIUS_METERS, limit);
    } catch (error) {
        // For the embedded widget a degraded render beats a crash, and it
        // claims nothing about proximity: fall back to municipality-wide
        // subjects only. Consumers where the emptiness IS the claim (the MCP
        // nearby tool) use getHotSubjectsNearPoint, which propagates instead.
        console.error('Radius filter failed; falling back to municipality-wide subjects:', error);
        const wide = flatten(meetings).filter(c => c.subject.locationId == null);
        return sortByRanking(wide, adapt).slice(0, limit);
    }
}

/**
 * Hot subjects near an arbitrary point — the same recent window and
 * near-first/municipality-wide ordering as {@link getHotSubjectsNearGeohash},
 * but with a caller-chosen center and radius.
 *
 * The result itself is not cached (the coordinate space is unbounded), but the
 * meetings come from the cached public query — unlike the geohash variant,
 * which must use the uncached one because it runs inside createCache.
 *
 * Alongside the ranked subjects, reports the scan bound — how many recent
 * meetings were considered and the oldest one's date — because the window is a
 * meeting *count* (HOT_MEETING_WINDOW), which spans days for a busy council
 * and months for a quiet one. Consumers publishing an empty result must say
 * "nothing since {oldestMeetingDate}", not "nothing". Query failures propagate.
 */
export async function getHotSubjectsNearPoint(
    cityId: string,
    center: [number, number],
    radiusMeters: number,
    limit: number
): Promise<{
    subjects: HotSubject[];
    meetingsScanned: number;
    /** A string rather than a Date when the meetings come off a cache hit. */
    oldestMeetingDate: Date | string | null;
}> {
    const meetings = await getCouncilMeetingsForCityPublicCached(cityId, {
        limit: HOT_MEETING_WINDOW, timeFilter: 'past',
    });
    const subjects = await rankSubjectsNearPoint(meetings, center, radiusMeters, limit);
    return {
        subjects,
        meetingsScanned: meetings.length,
        oldestMeetingDate: meetings.length > 0 ? meetings[meetings.length - 1].dateTime : null,
    };
}

/** A ranked subject with its distance from a reference point attached. */
export type HotSubjectWithDistance = HotSubject & {
    /** Meters from the point; null for municipality-wide subjects with no pinned location. */
    distanceMeters: number | null;
};

/**
 * Attach each subject's distance (m) from `center`. Shared by the two public
 * surfaces that publish `distanceMeters` (the MCP nearby tool and the embed
 * subjects endpoint) so the null-semantics can't drift: null means "no pinned
 * location", never "distance unavailable" — which is why query failures
 * propagate instead of degrading to nulls.
 */
export async function withDistances(
    items: HotSubject[],
    center: [number, number]
): Promise<HotSubjectWithDistance[]> {
    const distances = await getLocationDistancesFromPoint(
        items.map(item => item.subject.locationId).filter((id): id is string => id != null),
        center
    );
    return items.map(item => ({
        ...item,
        distanceMeters:
            item.subject.locationId != null ? distances.get(item.subject.locationId) ?? null : null,
    }));
}

/**
 * Hot subjects near a geohash cell — same recent window as {@link getRecentHotSubjects},
 * but restricted to subjects within 500m of the cell center OR with no location,
 * with the within-radius subjects shown first. Cached per geohash so repeat loads
 * of the same embedded widget are fast.
 */
export async function getHotSubjectsNearGeohash(
    cityId: string,
    geohash: string,
    filter: BodyFilter & { limit: number }
): Promise<HotSubject[]> {
    const typeKey = filter.administrativeBodyTypes?.length
        ? `types:${[...filter.administrativeBodyTypes].sort().join(',')}` : 'types:all';
    const idKey = filter.administrativeBodyIds?.length
        ? `ids:${[...filter.administrativeBodyIds].sort().join(',')}` : 'ids:all';
    return createCache(
        () => computeHotSubjectsNearGeohash(cityId, geohash, filter),
        ['city', cityId, 'hotSubjectsGeo', GEO_CACHE_VERSION, geohash, typeKey, idKey, `limit:${filter.limit}`],
        { tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`, `geohash:${geohash}`] }
    )();
}
