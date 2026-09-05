import { AdministrativeBodyType, Realm } from "@prisma/client";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { getCity, getAllCitiesMinimal, getAllCityIds, getSupportedCitiesWithLogos, getAboutPageStats, getCityIdContainingPoint } from "@/lib/db/cities";
import { decodeGeohashToCenter } from "@/lib/geo";
import { getGitHubStats } from "@/lib/github";
import { getCityMessage } from "@/lib/db/cityMessages";
import { getCouncilMeetingsForCity, getCouncilMeetingsWithSubjectPreview, type MeetingListOptions } from "@/lib/db/meetingsList";
import { getAdjacentMeetings } from "@/lib/db/adjacentMeetings";
import { countCityPetitions } from "@/lib/db/petitions";
import { petitionBucket, type PetitionBucket } from "@/lib/landing/petitions";
import { MEETING_PREVIEW_CACHE_VERSION } from "@/lib/db/types";
import { getPartiesForCity } from "@/lib/db/parties";
import { getPeopleForCity } from "@/lib/db/people";
import { getSubjectCountForCity, getSubjectsForMeeting, SubjectWithRelations } from "@/lib/db/subject";
import { getAdministrativeBodiesForCity, getAdministrativeBodiesWithPublicMeetings } from "@/lib/db/administrativeBodies";
import { getMeetingStatus } from "@/lib/meetingStatus";
import { getBatchStatisticsForSubjects, Statistics } from "@/lib/statistics";
import { createCache } from "./index";
import { getCityCoverage } from "@/lib/db/coverage";

/**
 * How long a time-filtered meeting query may go stale.
 *
 * Such a result is a function of `now`, which getCouncilMeetingsForCity reads
 * inside the cached call. No tag can express "a meeting has since happened", so
 * without a TTL an 'upcoming' entry keeps serving a meeting that is already
 * over. Time-independent queries stay purely tag-driven.
 */
const TIME_FILTERED_TTL = 900;

/**
 * What a cached meeting-list wrapper accepts.
 *
 * `includeUnreleased` is not the caller's to set: each wrapper below resolves
 * it — from the reader's authorization, or to false — and overrides whatever it
 * was handed. Leaving it in the signature let a caller ask for unreleased
 * meetings, type-check, and quietly get released ones.
 */
type CachedMeetingListOptions = Omit<MeetingListOptions, 'includeUnreleased'>;

/**
 * Cached list of all city ids (single shared cache key, tag `cities:all`).
 * Use to validate route cityId params BEFORE calling any per-city cached
 * function: per-city caches key by cityId, so a junk slug (bot probe) would
 * otherwise write a `city:<junk>:*` entry to the shared cache (#358).
 */
export async function getAllCityIdsCached(realm: Realm) {
  return createCache(
    () => getAllCityIds(realm),
    ['cities', 'ids', realm],
    { tags: ['cities:all', `realm:${realm}:cities:all`] }
  )();
}

/**
 * Cached geohash → listed-city resolution (point-in-polygon on the cell center).
 * Keyed per geohash so every widget load of the same cell hits the cache.
 * Tagged `city` so boundary/status changes revalidate it.
 */
export async function getCityIdForGeohashCached(geohash: string) {
  return createCache(
    () => getCityIdContainingPoint(decodeGeohashToCenter(geohash)),
    ['embed', 'geohashCity', geohash],
    { tags: ['city'] }
  )();
}

/**
 * Cached version of getCity that fetches and caches basic city data
 */
export async function getCityCached(cityId: string) {
  return createCache(
    () => getCity(cityId),
    ['city', cityId, 'basic'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:basic`] }
  )();
}

/**
 * The same city row plus its boundary polygon — what a map needs to frame the δήμος. Kept apart
 * from getCityCached so the pages that only want identity never carry a polygon through the cache.
 */
export async function getCityWithGeometryCached(cityId: string) {
  return createCache(
    () => getCity(cityId, { includeGeometry: true }),
    ['city', cityId, 'geometry'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:geometry`] }
  )();
}

/**
 * A city's meetings with their full subject rows. Released only, so it needs
 * no headers() call and is safe on a static page.
 */
export async function getCouncilMeetingsForCityPublicCached(cityId: string, options: CachedMeetingListOptions = {}) {
  return createCache(
    () => getCouncilMeetingsForCity(cityId, { ...options, includeUnreleased: false }),
    ['city', cityId, 'meetings', 'onlyReleased', ...meetingListKey(options)],
    {
      tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`],
      ...(options.timeFilter ? { revalidate: TIME_FILTERED_TTL } : {}),
    }
  )();
}

/**
 * Cache-key fragments for a filter on administrative bodies.
 *
 * Every cache whose query accepts one keys on it through here. A key that
 * drifts from the query it stands for stays invisible until the day it serves
 * another filter's rows.
 */
export function bodyFilterKey({ administrativeBodyTypes, administrativeBodyIds }: {
  administrativeBodyTypes?: AdministrativeBodyType[];
  administrativeBodyIds?: string[];
}): string[] {
  return [
    administrativeBodyTypes?.length ? `types:${[...administrativeBodyTypes].sort().join(',')}` : 'types:all',
    administrativeBodyIds?.length ? `ids:${[...administrativeBodyIds].sort().join(',')}` : 'ids:all',
  ];
}

/** Cache-key fragments for the filters a meeting list query accepts. */
function meetingListKey(options: MeetingListOptions): string[] {
  const { limit, page, pageSize = 12, from, to, timeFilter } = options;
  return [
    page ? `page:${page}:${pageSize}` : (limit ? `limit:${limit}` : 'all'),
    ...bodyFilterKey(options),
    timeFilter ?? 'all',
    // from/to go into the where, so they have to go into the key — without them
    // two different date ranges are one cache entry.
    `range:${from?.toISOString() ?? ''}:${to?.toISOString() ?? ''}`,
  ];
}

/**
 * Meetings carrying only what a card draws — see getCouncilMeetingsWithSubjectPreview.
 *
 * Authorization is resolved outside the cached call: headers() cannot be
 * read inside one.
 */
export async function getCouncilMeetingsPreviewCached(cityId: string, options: CachedMeetingListOptions = {}) {
  const includeUnreleased = await isUserAuthorizedToEdit({ cityId });
  return createCache(
    () => getCouncilMeetingsWithSubjectPreview(cityId, { ...options, includeUnreleased }),
    ['city', cityId, 'meetingPreviews', MEETING_PREVIEW_CACHE_VERSION, includeUnreleased ? 'withUnreleased' : 'onlyReleased', ...meetingListKey(options)],
    {
      tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`],
      ...(options.timeFilter ? { revalidate: TIME_FILTERED_TTL } : {}),
    }
  )();
}

/** Public (no-auth) counterpart, safe for static pages. */
export async function getCouncilMeetingsPreviewPublicCached(cityId: string, options: CachedMeetingListOptions = {}) {
  return createCache(
    () => getCouncilMeetingsWithSubjectPreview(cityId, { ...options, includeUnreleased: false }),
    ['city', cityId, 'meetingPreviews', MEETING_PREVIEW_CACHE_VERSION, 'onlyReleased', ...meetingListKey(options)],
    {
      tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`],
      ...(options.timeFilter ? { revalidate: TIME_FILTERED_TTL } : {}),
    }
  )();
}

/**
 * The public "N+" bucket of a city's petitions, or null under the display
 * threshold — the landing map's own coarseness, never an exact count. Hourly,
 * like the map's list: petition counts move on their own, with no city
 * mutation to invalidate on.
 */
export async function getCityPetitionBucketCached(cityId: string): Promise<PetitionBucket | null> {
    return createCache(
        async () => petitionBucket(await countCityPetitions(cityId)),
        ['city', cityId, 'petitionBucket'],
        { tags: ['city', `city:${cityId}`], revalidate: 3600 }
    )();
}

/**
 * The meetings either side of one, for the header's previous/next. Editors
 * step through unreleased meetings too, so the two views cache apart.
 */
export async function getAdjacentMeetingsCached(cityId: string, meetingId: string, includeUnreleased: boolean) {
    return createCache(
        () => getAdjacentMeetings(cityId, meetingId, { includeUnreleased }),
        ['city', cityId, 'meeting', meetingId, 'adjacent', includeUnreleased ? 'withUnreleased' : 'onlyReleased'],
        { tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`] },
    )();
}

/**
 * Cached derived status per meeting
 */
export async function getMeetingStatusCached(cityId: string, meetingId: string) {
    return createCache(
        () => getMeetingStatus(cityId, meetingId),
    ['city', cityId, 'meetings', 'derived', meetingId],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`, `city:${cityId}:meeting:${meetingId}:derived`] }
  )();
}

/**
 * Cached version of getPartiesForCity that fetches and caches all parties for a city
 */
export async function getPartiesForCityCached(cityId: string) {
  return createCache(
    () => getPartiesForCity(cityId),
    ['city', cityId, 'parties'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:parties`] }
  )();
}

/**
 * Cached version of getPeopleForCity that fetches and caches all people for a city
 */
export async function getPeopleForCityCached(cityId: string) {
  return createCache(
    () => getPeopleForCity(cityId),
    ['city', cityId, 'people'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:people`] }
  )();
}

/**
 * Cached version of getAdministrativeBodiesForCity that fetches and caches all administrative bodies for a city
 */
export async function getAdministrativeBodiesForCityCached(cityId: string) {
  return createCache(
    () => getAdministrativeBodiesForCity(cityId),
    ['city', cityId, 'administrativeBodies'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:administrativeBodies`] }
  )();
}

/**
 * Cached administrative bodies that have at least one released meeting.
 * Tagged with `:meetings` too, so releasing/unreleasing a meeting revalidates it.
 */
export async function getAdministrativeBodiesWithPublicMeetingsCached(cityId: string) {
  return createCache(
    () => getAdministrativeBodiesWithPublicMeetings(cityId),
    ['city', cityId, 'administrativeBodies', 'withPublicMeetings'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:administrativeBodies`, `city:${cityId}:meetings`] }
  )();
}

export async function getAllCitiesMinimalCached(realm: Realm) {
  return createCache(
    () => getAllCitiesMinimal(realm),
    ['cities', 'all', realm],
    { tags: ['cities:all', `realm:${realm}:cities:all`] }
  )();
}

/**
 * Cached version of getSupportedCitiesWithLogos.
 * Intentionally NOT realm-scoped: the about page shows the full set of supported
 * municipalities across all realms (e.g. opencouncil.fr displays the Greek cities too).
 */
export async function getSupportedCitiesWithLogosCached() {
  return createCache(
    () => getSupportedCitiesWithLogos(),
    ['cities', 'supported-with-logos', 'global'],
    { tags: ['cities:all'] }
  )();
}

/**
 * Cached version of getCityMessage that fetches and caches city message data
 */
export async function getCityMessageCached(cityId: string) {
  return createCache(
    () => getCityMessage(cityId),
    ['city', cityId, 'message'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:message`] }
  )();
}

export async function getSubjectCountForCityCached(cityId: string) {
  return createCache(
    () => getSubjectCountForCity(cityId),
    ['city', cityId, 'subjectCount'],
    {
      tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`],
      // The count only includes meetings already held, so it grows with the clock
      // as well as with the data — the same reason the time-filtered meeting
      // queries carry a TTL.
      revalidate: 900,
    }
  )();
}

export async function getSubjectsForMeetingCached(cityId: string, meetingId: string) {
  return createCache(
    () => getSubjectsForMeeting(cityId, meetingId),
    ['city', cityId, 'meeting', meetingId, 'subjects'],
    { tags: [`city:${cityId}`, `city:${cityId}:meetings`, `city:${cityId}:meeting:${meetingId}`] }
  )();
}

export async function getSubjectStatisticsCached(
  cityId: string,
  meetingId: string,
  subjects: SubjectWithRelations[],
  meetingDateTime: Date | string,
): Promise<Record<string, Statistics>> {
  const includeUnreleased = await isUserAuthorizedToEdit({ cityId });

  return createCache(
    async () => {
      const map = await getBatchStatisticsForSubjects(
        subjects.map(s => s.id),
        new Date(meetingDateTime),
        { includeUnreleased }
      );
      return Object.fromEntries(map);
    },
    ['city', cityId, 'meeting', meetingId, 'subjectStatistics', ...(includeUnreleased ? ['withUnreleased'] : ['onlyReleased'])],
    { tags: [`city:${cityId}`, `city:${cityId}:meetings`, `city:${cityId}:meeting:${meetingId}`] }
  )();
}

/**
 * Cached aggregate stats for the about page (municipality count, subject count, meeting hours).
 * Intentionally NOT realm-scoped: the about page is a marketing page and shows platform-wide
 * totals across all realms (e.g. opencouncil.fr displays the same achieved numbers as opencouncil.gr).
 */
export async function getAboutPageStatsCached() {
  return createCache(
    () => getAboutPageStats(),
    ['about', 'stats', 'global'],
    { tags: ['cities:all'] }
  )();
}

/**
 * Cached GitHub stats for the about page (contributors, commit activity, stars)
 */
export async function getGitHubStatsCached() {
  return createCache(
    () => getGitHubStats(),
    ['about', 'github'],
    { tags: ['github'], revalidate: 86400 } // refresh once per day
  )();
}

/**
 * Cached per-city coverage for the /explain "Κάλυψη" table. Scans every released
 * meeting of every supported city, so it must not run per request — cache it and
 * refresh every 15 minutes (also picks up newly-past meetings). Revalidated by
 * city/meeting changes via the `cities:all` tag.
 */
export async function getCityCoverageCached(realm: Realm) {
  return createCache(
    () => getCityCoverage(realm),
    ['explain', 'coverage', realm],
    { tags: ['cities:all', `realm:${realm}:cities:all`], revalidate: 900 }
  )();
}
