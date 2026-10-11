import type { CouncilMeeting } from '@prisma/client';

/**
 * Version tag for cache keys built over the meeting-preview projection
 * (`meetingWithSubjectPreviewInclude` in src/lib/db/meetings.ts). Bump it in
 * the same edit that changes that include — persisted unstable_cache entries
 * keep serving the old shape under the old key otherwise. It lives here
 * because meetings.ts is a "use server" module and cannot export a constant.
 */
export const MEETING_PREVIEW_CACHE_VERSION = 'v3';

/** What the header needs to step to a neighbouring meeting. */
export type AdjacentMeeting = Pick<CouncilMeeting, 'id' | 'name' | 'name_en'>;

export type AdjacentMeetings = {
    /** The meeting held before this one, or null at the start. */
    previous: AdjacentMeeting | null;
    /** The meeting held after this one, or null at the end. */
    next: AdjacentMeeting | null;
};
