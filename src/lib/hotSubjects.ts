import { AdministrativeBodyType } from '@prisma/client';
import { createCache, getCouncilMeetingsForCityPublicCached } from '@/lib/cache';
import { getCouncilMeetingsForCity, type CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { getContributionCount } from '@/lib/utils';
import { sortByRanking, type RankableSubject } from '@/lib/ranking/subjects';
import { filterLocationIdsWithinRadius } from '@/lib/db/location';
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

function flatten(meetings: Meeting[]): HotSubject[] {
    return meetings.flatMap(meeting => meeting.subjects.map(subject => ({ subject, meeting })));
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
    const candidates = flatten(meetings);

    const center = decodeGeohashToCenter(geohash);
    const locatedIds = candidates
        .map(c => c.subject.locationId)
        .filter((id): id is string => id != null);
    const nearby = new Set(await filterLocationIdsWithinRadius(locatedIds, center, GEO_RADIUS_METERS));

    // Location-targeted ordering: subjects within the 500m radius come first
    // (that's the whole point of the geohash), then municipality-wide
    // (no-location) subjects fill any remaining slots. Each group is ranked on
    // its own by the standard recency/discussion blend.
    const near = candidates.filter(c => c.subject.locationId != null && nearby.has(c.subject.locationId));
    const wide = candidates.filter(c => c.subject.locationId == null);
    return [...sortByRanking(near, adapt), ...sortByRanking(wide, adapt)].slice(0, limit);
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
