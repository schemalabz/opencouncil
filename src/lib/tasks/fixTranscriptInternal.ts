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
import { getRequestOnTranscriptRequestBody } from '../db/utils';

export const requestFixTranscriptInternal = async (councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    const requestBody = await getRequestOnTranscriptRequestBody(councilMeetingId, cityId);

    // Imported here, not at the top: ./tasks reaches this module back through
    // ./registry, and a static import would close that cycle.
    const { startTask } = await import('./tasks');
    return startTask('fixTranscript', requestBody, councilMeetingId, cityId, options);
};
