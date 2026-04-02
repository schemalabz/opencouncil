import { isUserAuthorizedToEdit } from "@/lib/auth";
import { getCity, getAllCitiesMinimal, getSupportedCitiesWithLogos, getAboutPageStats } from "@/lib/db/cities";
import { getGitHubStats } from "@/lib/github";
import { getCityMessage } from "@/lib/db/cityMessages";
import { getCouncilMeetingsForCity } from "@/lib/db/meetings";
import { getPartiesForCity } from "@/lib/db/parties";
import { getPeopleForCity } from "@/lib/db/people";
import { getSubjectsForMeeting, SubjectWithRelations } from "@/lib/db/subject";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { getMeetingStatus } from "@/lib/meetingStatus";
import { getBatchStatisticsForSubjects, Statistics } from "@/lib/statistics";
import { createCache } from "./index";
import { fetchLatestSubstackPost } from "@/lib/db/landing";

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
 * Cached version of getCouncilMeetingsForCity that fetches and caches all meetings for a city
 */
export async function getCouncilMeetingsForCityCached(cityId: string, { limit, page, pageSize = 12 }: { limit?: number; page?: number; pageSize?: number } = {}) {
  // Check if the user is authorized to edit the city
  // This happens OUTSIDE the cached function to avoid using headers() inside cache
  const includeUnreleased = await isUserAuthorizedToEdit({ cityId });

  return createCache(
    () => getCouncilMeetingsForCity(cityId, { includeUnreleased, limit, page, pageSize }),
    ['city', cityId, 'meetings', includeUnreleased ? 'withUnreleased' : 'onlyReleased', page ? `page:${page}:${pageSize}` : (limit ? `limit:${limit}` : 'all')],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`] }
  )();
}

/**
 * Public (no-auth) version of getCouncilMeetingsForCityCached.
 * Only returns released meetings. Safe for static pages (no headers() call).
 */
export async function getCouncilMeetingsForCityPublicCached(cityId: string, { limit }: { limit?: number } = {}) {
  return createCache(
    () => getCouncilMeetingsForCity(cityId, { includeUnreleased: false, limit }),
    ['city', cityId, 'meetings', 'onlyReleased', limit ? `limit:${limit}` : 'all'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`] }
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
 * Cached version of fetchLatestSubstackPost that fetches and caches the latest Substack post
 */
export async function fetchLatestSubstackPostCached() {
  return createCache(
    () => fetchLatestSubstackPost(),
    ['substack', 'latest-post'],
    { tags: ['substack', 'substack:latest-post'] }
  )();
}

export async function getAllCitiesMinimalCached() {
  return createCache(
    () => getAllCitiesMinimal(),
    ['cities', 'all'],
    { tags: ['cities:all'] }
  )();
}

/**
 * Cached version of getSupportedCitiesWithLogos
 */
export async function getSupportedCitiesWithLogosCached() {
  return createCache(
    () => getSupportedCitiesWithLogos(),
    ['cities', 'supported-with-logos'],
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
  return createCache(
    async () => {
      const map = await getBatchStatisticsForSubjects(
        subjects.map(s => s.id),
        new Date(meetingDateTime)
      );
      return Object.fromEntries(map);
    },
    ['city', cityId, 'meeting', meetingId, 'subjectStatistics'],
    { tags: [`city:${cityId}`, `city:${cityId}:meetings`, `city:${cityId}:meeting:${meetingId}`] }
  )();
}

/**
 * Cached aggregate stats for the about page (municipality count, subject count, meeting hours)
 */
export async function getAboutPageStatsCached() {
  return createCache(
    () => getAboutPageStats(),
    ['about', 'stats'],
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
