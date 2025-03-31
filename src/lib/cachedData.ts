import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getMeetingData, MeetingData } from "@/lib/getMeetingData";
import { getCity } from "@/lib/db/cities";
import { getCouncilMeetingsCountForCity, getCouncilMeetingsForCity } from "@/lib/db/meetings";
import { getPartiesForCity } from "@/lib/db/parties";
import { isUserAuthorizedToEdit } from "@/lib/auth";

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
    return unstable_cache(
        async () => getCity(cityId),
        ['city', cityId, 'basic'],
        { tags: [`city`, `city:${cityId}`, `city:${cityId}:basic`] }
    )();
}

/**
 * Cached version of getCouncilMeetingsForCity that fetches and caches all meetings for a city
 */
export async function getCouncilMeetingsForCityCached(cityId: string) {
    // Check if the user is authorized to edit the city
    // This happens OUTSIDE the cached function to avoid using headers() inside cache
    const includeUnreleased = await isUserAuthorizedToEdit({ cityId });
    
    return unstable_cache(
        async () => getCouncilMeetingsForCity(cityId, { includeUnreleased }),
        ['city', cityId, 'meetings', includeUnreleased ? 'withUnreleased' : 'onlyReleased'],
        { tags: [`city`, `city:${cityId}`, `city:${cityId}:meetings`, `city:${cityId}:meetings:${includeUnreleased ? 'withUnreleased' : 'onlyReleased'}`] }
    )();
}

/** 
 * Cached version of getCouncilMeetingsCountForCity that fetches and caches the count of all meetings for a city
 */
export async function getCouncilMeetingsCountForCityCached(cityId: string) {
    return unstable_cache(
        async () => getCouncilMeetingsCountForCity(cityId),
        ['city', cityId, 'meetingsCount'],
        { tags: [`city`, `city:${cityId}`, `city:${cityId}:meetings`] }
    )();
} 

/**
 * Cached version of getPartiesForCity that fetches and caches all parties for a city
 */
export async function getPartiesForCityCached(cityId: string) {
    return unstable_cache(
        async () => getPartiesForCity(cityId),
        ['city', cityId, 'parties'],
        { tags: [`city`, `city:${cityId}`, `city:${cityId}:parties`, `city:${cityId}:people`] }
    )();
} 