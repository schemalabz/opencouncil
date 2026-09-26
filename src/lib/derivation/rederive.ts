import 'server-only';
import { getMeetingsOfSubjects } from '@/lib/db/subject';
import { deriveAndPersist } from './persist';

/**
 * Re-derive a meeting after an edit of one of its readings has committed (spec
 * §5.2). A failure is logged, not thrown: the edit stands, and the four tables
 * keep their last snapshot until the next derivation.
 */
export async function rederiveMeetingQuietly(cityId: string, meetingId: string): Promise<void> {
    try {
        await deriveAndPersist(cityId, meetingId);
    } catch (error) {
        console.error(`Re-derive after an edit failed for ${cityId}/${meetingId}:`, error);
    }
}

/** Re-derive each meeting the given subjects belong to, once per meeting. */
export async function rederiveMeetingsOfSubjects(subjectIds: string[]): Promise<void> {
    let meetings: { cityId: string; councilMeetingId: string }[];
    try {
        meetings = await getMeetingsOfSubjects(subjectIds);
    } catch (error) {
        console.error(`Re-derive after an edit failed to look up the meetings of ${subjectIds.join(', ')}:`, error);
        return;
    }
    for (const m of meetings) await rederiveMeetingQuietly(m.cityId, m.councilMeetingId);
}
