/**
 * Upload configuration for generating meaningful filenames
 * Simple and flexible: provide cityId, identifier, and optional suffix
 * 
 * Pattern: {cityId}_{identifier}_{suffix}.{ext}
 * 
 * Examples:
 *   { cityId: 'chania', identifier: 'aug15_2025', suffix: 'recording' } → chania_aug15_2025_recording.mp4
 *   { cityId: 'chania', identifier: 'aug15_2025', suffix: 'agenda' } → chania_aug15_2025_agenda.pdf
 *   { cityId: 'chania', identifier: 'democrats', suffix: 'logo' } → chania_democrats_logo.png
 */
import { LOGO_IMAGE_TYPES } from '@/lib/utils/imageUpload';
import type { AuthorizationScope } from '@/lib/auth';

/** Content types accepted for logo uploads (cities, parties); the reason for the set is with the list. */
export const ALLOWED_LOGO_CONTENT_TYPES = LOGO_IMAGE_TYPES;

export interface UploadConfig {
    /** City identifier for authorization and naming */
    cityId?: string
    /** Entity identifier (e.g., meetingId, partySlug, personSlug) */
    identifier?: string
    /** Optional suffix for the filename (e.g., 'recording', 'agenda', 'logo') */
    suffix?: string
    /**
     * The body of the meeting the file is for, so that an admin of that body
     * may upload before the meeting row exists.
     */
    administrativeBodyId?: string
}


/**
 * Who may upload under a config: a superadmin with no city, a city admin with
 * a city, and also the admins of the body when the config names one.
 */
export function uploadAuthorizationScope(config: UploadConfig | undefined): AuthorizationScope {
    if (!config?.cityId) return {}
    if (config.administrativeBodyId) return { cityId: config.cityId, administrativeBodyId: config.administrativeBodyId }
    return { cityId: config.cityId }
}
