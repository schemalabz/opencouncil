import 'server-only';
import { getMeetingsOfBody } from '@/lib/db/derivationFacts';
import { getMeetingsOfSubjects } from '@/lib/db/subject';
import { deriveAndPersist } from './persist';

/**
 * Re-derive a meeting after an edit of one of its readings has committed. A
 * failure is logged, not thrown: the edit stands, and the four tables
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

/**
 * Re-derive every meeting of a body after a person confirms or starts its
 * conventions record: the derivation reads the conventions too. It reads no
 * page; the pages that the body's polls left unread wait for a manual poll.
 */
export async function rederiveMeetingsOfBody(administrativeBodyId: string): Promise<void> {
    let meetings: { cityId: string; id: string }[];
    try {
        meetings = await getMeetingsOfBody(administrativeBodyId);
    } catch (error) {
        console.error(`Re-derive after a conventions change failed to look up the meetings of body ${administrativeBodyId}:`, error);
        return;
    }
    for (const m of meetings) await rederiveMeetingQuietly(m.cityId, m.id);
}
