import { cache } from "react";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { getCity, getAllCitiesMinimal } from "@/lib/db/cities";
import { getCityMessage } from "@/lib/db/cityMessages";
import { getCouncilMeetingsForCity, getCouncilMeetingsCountForCity } from "@/lib/db/meetings";
import { getPartiesForCity } from "@/lib/db/parties";
import { getPeopleForCity } from "@/lib/db/people";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { getMeetingData, MeetingData } from "@/lib/getMeetingData";
import { createCache } from "./index";
import { fetchLatestSubstackPost } from "@/lib/db/landing";

/**
 * Cached version of getMeetingData that fetches and caches all data for a meeting
 */
export const getMeetingDataCached = cache(async (cityId: string, meetingId: string): Promise<MeetingData | null> => {
  const startTime = performance.now();
  console.log(`Fetching meeting data for`, cityId, meetingId);

  try {
    const data = await getMeetingData(cityId, meetingId);
    console.log(`Got meeting data in ${performance.now() - startTime}ms`);
    return data;
  } catch (error) {
    console.error(`Error fetching meeting data for ${cityId}/${meetingId}:`, error);
    return null;
  }
});

/**
 * Helper function to get a specific subject from cached meeting data
 */
export async function getSubjectFromMeetingCached(cityId: string, meetingId: string, subjectId: string) {
  const meetingData = await getMeetingDataCached(cityId, meetingId);

  if (!meetingData) {
    return null;
  }

  const subject = meetingData.subjects.find(s => s.id === subjectId);
  return subject || null;
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
 * Cached version of getCouncilMeetingsForCity that fetches and caches all meetings for a city
 */
export async function getCouncilMeetingsForCityCached(cityId: string, { limit }: { limit?: number } = {}) {
  // Check if the user is authorized to edit the city
  // This happens OUTSIDE the cached function to avoid using headers() inside cache
  const includeUnreleased = await isUserAuthorizedToEdit({ cityId });
  
  return createCache(
    () => getCouncilMeetingsForCity(cityId, { includeUnreleased, limit }),
    ['city', cityId, 'meetings', includeUnreleased ? 'withUnreleased' : 'onlyReleased', limit ? `limit:${limit}` : 'all'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`] }
  )();
}

/** 
 * Cached version of getCouncilMeetingsCountForCity that fetches and caches the count of all meetings for a city
 */
export async function getCouncilMeetingsCountForCityCached(cityId: string) {
  return createCache(
    () => getCouncilMeetingsCountForCity(cityId),
    ['city', cityId, 'meetings', 'count'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`] }
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
 * Cached version of getCityMessage that fetches and caches city message data
 */
export async function getCityMessageCached(cityId: string) {
  return createCache(
    () => getCityMessage(cityId),
    ['city', cityId, 'message'],
    { tags: ['city', `city:${cityId}`, `city:${cityId}:message`] }
  )();
}