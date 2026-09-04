import { AdministrativeBodyType } from '@prisma/client';
import { bodyFilterKey, createCache, getCouncilMeetingsForCityPublicCached } from '@/lib/cache';
import { getCouncilMeetingsForCity, type CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetingsList';
import { getContributionCount } from '@/lib/utils';
import { getDiscussionSecondsForSubjects } from '@/lib/db/subject';
import { sortByRanking, type RankableSubject } from '@/lib/ranking/subjects';
import { filterLocationIdsWithinRadius, getLocationDistancesFromPoint } from '@/lib/db/location';
import { decodeGeohashToCenter } from '@/lib/geo';
import { monthsAgo } from '@/lib/utils/hotTopicFilters';

/** Recent past meetings to draw "hot" subjects from when no period is given. */
const HOT_MEETING_WINDOW = 8;
/**
 * Safety bound when a period IS given: the window is then the period, and this
 * only stops a very busy council from ranking a year of agendas in one request.
 */
const HOT_PERIOD_MEETING_CAP = 60;
/** Radius (m) around the geohash cell center for the location-filtered variant. */
const GEO_RADIUS_METERS = 500;
/** Bump when the ranking/selection logic changes so cached results don't go stale. */
const GEO_CACHE_VERSION = 'v3';

type Meeting = CouncilMeetingWithAdminBodyAndSubjects;
export type HotSubject = { subject: Meeting['subjects'][number]; meeting: Meeting };

interface BodyFilter {
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
    /** How far back to look. Omitted means the last {@link HOT_MEETING_WINDOW} meetings. */
    months?: number;
}

/** The meetings query's window for a filter — a period when one is asked for. */
function windowFor({ months }: BodyFilter) {
    if (!months) return { limit: HOT_MEETING_WINDOW };
    return { limit: HOT_PERIOD_MEETING_CAP, from: monthsAgo(months) };
}

type Window = ReturnType<typeof windowFor>;

/**
 * The window's meetings, or the most recent ones when the window holds none.
 *
 * A period can legitimately be empty — a council in summer recess, a city whose
 * releases lag — and this ranking is the city page's lead content, so an empty
 * period must not empty the page. The caller can tell the fallback happened:
 * every meeting it gets back then predates the window.
 */
async function meetingsFor(
    filter: BodyFilter,
    fetch: (window: Window) => Promise<Meeting[]>,
): Promise<Meeting[]> {
    const window = windowFor(filter);
    const meetings = await fetch(window);
    if (meetings.length > 0 || !('from' in window)) return meetings;
    return fetch({ limit: HOT_MEETING_WINDOW });
}

/**
 * Every subject of the given meetings, minus the ones that cannot be "hot".
 *
 * A withdrawn subject was pulled before it could be discussed, so it never
 * qualifies. A subject nobody spoke to is dropped only when the window holds
 * something that was: contributions are written at summarization, so a city
 * whose meetings are released but not yet summarized has zero everywhere —
 * filtering unconditionally would empty the embed widget municipalities put on
 * their own sites rather than fall back to recency, which is the ranking those
 * subjects can still support.
 */
function flatten(meetings: Meeting[]): HotSubject[] {
    const candidates = meetings.flatMap(meeting =>
        meeting.subjects
            .filter(subject => !subject.withdrawn)
            .map(subject => ({ subject, meeting })),
    );
    const discussed = candidates.filter(c => getContributionCount(c.subject) > 0);
    return discussed.length > 0 ? discussed : candidates;
}

/**
 * The ranker's view of a candidate, built against the same signals the landing
 * map ranks on (useFilteredSubjects' toRankable) so the two surfaces agree on
 * what "hot" means.
 *
 * `discussionSignal` is minutes of debate, not a contribution count: the two
 * disagree often — a subject can draw many short interventions or one long one —
 * and it carries the heaviest weight in the blend, so using a different signal
 * here produced a visibly different order for the same subjects.
 */
function adapter(discussionSeconds: Map<string, number>) {
    return (item: HotSubject): RankableSubject => ({
        cityId: item.meeting.cityId,
        meetingDate: item.meeting.dateTime,
        // Rounded to minutes exactly as toLandingSubjects does: the signal is
        // log-damped, so the unit changes the spacing between candidates.
        discussionSignal: Math.round((discussionSeconds.get(item.subject.id) ?? 0) / 60),
        adminBodyType: item.meeting.administrativeBody?.type ?? null,
        // Weak location tiebreaker in the non-geo widget; a no-op within the
        // geo variant's homogeneous near/wide groups.
        hasLocation: item.subject.locationId != null,
    });
}

/** Debate time for a candidate set — one query, whatever its size. */
function discussionSecondsFor(candidates: HotSubject[]): Promise<Map<string, number>> {
    return getDiscussionSecondsForSubjects(candidates.map(c => c.subject.id));
}

/** Rank the subjects of an already-fetched window of meetings. */
async function rankSubjectsOf(meetings: Meeting[], limit: number): Promise<HotSubject[]> {
    const candidates = flatten(meetings);
    const seconds = await discussionSecondsFor(candidates);
    return sortByRanking(candidates, adapter(seconds)).slice(0, limit);
}

/** Recent hottest subjects across a city's recent past meetings (no location filter). */
export async function getRecentHotSubjects(
    cityId: string,
    { limit, administrativeBodyTypes, administrativeBodyIds, months }: BodyFilter & { limit: number }
): Promise<HotSubject[]> {
    const meetings = await meetingsFor({ months }, window =>
        getCouncilMeetingsForCityPublicCached(cityId, {
            ...window, administrativeBodyTypes, administrativeBodyIds, timeFilter: 'past',
        }),
    );
    return rankSubjectsOf(meetings, limit);
}

/**
 * {@link getRecentHotSubjects} off the uncached meetings query, for callers that
 * run inside createCache — unstable_cache must never nest.
 */
export async function computeRecentHotSubjects(
    cityId: string,
    { limit, administrativeBodyTypes, administrativeBodyIds, months }: BodyFilter & { limit: number }
): Promise<HotSubject[]> {
    const meetings = await meetingsFor({ months }, window =>
        getCouncilMeetingsForCity(cityId, {
            includeUnreleased: false, ...window, administrativeBodyTypes, administrativeBodyIds, timeFilter: 'past',
        }),
    );
    return rankSubjectsOf(meetings, limit);
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
    const [nearbyIds, seconds] = await Promise.all([
        filterLocationIdsWithinRadius(locatedIds, center, radiusMeters),
        discussionSecondsFor(candidates),
    ]);
    const nearby = new Set(nearbyIds);
    const adapt = adapter(seconds);

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
    { limit, administrativeBodyTypes, administrativeBodyIds, months }: BodyFilter & { limit: number }
): Promise<HotSubject[]> {
    // Called inside the cached wrapper below — use the uncached meetings query so
    // we don't nest unstable_cache calls.
    const meetings = await meetingsFor({ months }, window =>
        getCouncilMeetingsForCity(cityId, {
            includeUnreleased: false, ...window, administrativeBodyTypes, administrativeBodyIds, timeFilter: 'past',
        }),
    );
    try {
        return await rankSubjectsNearPoint(meetings, decodeGeohashToCenter(geohash), GEO_RADIUS_METERS, limit);
    } catch (error) {
        // For the embedded widget a degraded render beats a crash, and it
        // claims nothing about proximity: fall back to municipality-wide
        // subjects only. Consumers where the emptiness IS the claim (the MCP
        // nearby tool) use getHotSubjectsNearPoint, which propagates instead.
        console.error('Radius filter failed; falling back to municipality-wide subjects:', error);
        const wide = flatten(meetings).filter(c => c.subject.locationId == null);
        return sortByRanking(wide, adapter(await discussionSecondsFor(wide))).slice(0, limit);
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
    return createCache(
        () => computeHotSubjectsNearGeohash(cityId, geohash, filter),
        // `months` keys the window the same way getHotSubjectCardsCached keys it:
        // the period is part of what the entry answers for, so two periods must
        // never share one.
        ['city', cityId, 'hotSubjectsGeo', GEO_CACHE_VERSION, geohash, ...bodyFilterKey(filter), `limit:${filter.limit}`, `months:${filter.months ?? 'default'}`],
        {
            tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`, `geohash:${geohash}`],
            // The window is the last N *past* meetings, a function of `now` that
            // no tag can express — the same reason the meeting queries carry one.
            revalidate: 900,
        }
    )();
}
