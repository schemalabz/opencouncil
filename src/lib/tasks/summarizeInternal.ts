/**
 * Core summarize request logic without auth checks.
 *
 * NOT in a "use server" file — this must not be callable as a Server Action.
 * Only called from:
 *   - requestSummarize (after withUserAuthorizedToEdit), in ./summarize
 *   - startMeetingTask, whose callers authorize with a token instead of a session
 */
import "server-only";
import { getSummarizeRequestBody } from '@/lib/db/utils';
import { startTask } from './tasks';

export async function requestSummarizeInternal(
    cityId: string,
    councilMeetingId: string,
    requestedSubjects: string[] = [],
    additionalInstructions?: string,
    { force = false }: { force?: boolean } = {}
) {
    const body = await getSummarizeRequestBody(councilMeetingId, cityId, requestedSubjects, additionalInstructions, { force });
    return startTask('summarize', body, councilMeetingId, cityId, { force });
}
