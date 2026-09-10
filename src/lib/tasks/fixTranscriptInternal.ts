/**
 * Core fixTranscript request logic without auth checks.
 *
 * NOT in a "use server" file — this must not be callable as a Server Action.
 * Only called from:
 *   - requestFixTranscript (after withUserAuthorizedToEdit), in ./fixTranscript
 *   - the transcribe result handler's auto-trigger, which runs on a task-server
 *     callback with no user session to authorize against
 */
import "server-only";
import { getRequestOnTranscriptRequestBody } from '@/lib/db/utils';
import { startTask } from '@/lib/tasks/tasks';

export const requestFixTranscriptInternal = async (councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    const requestBody = await getRequestOnTranscriptRequestBody(councilMeetingId, cityId);
    return startTask('fixTranscript', requestBody, councilMeetingId, cityId, options);
};
