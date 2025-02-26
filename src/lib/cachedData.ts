import { cache } from "react";
import { getMeetingData, MeetingData } from "./getMeetingData";

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
