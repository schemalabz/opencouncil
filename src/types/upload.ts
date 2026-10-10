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
    /**
     * The existing meeting the file is for. It takes precedence over the body:
     * the editors of the meeting may upload, an admin of its body among them.
     */
    councilMeetingId?: string
}


/**
 * The base of the object key of an upload, before the collision suffix:
 * `{cityId}_{identifier}_{suffix}.{ext}`. Null when the config names nothing,
 * so the route falls back to a random name.
 *
 * The key follows the scope that authorized the upload (#828). A file for an
 * existing meeting is named after that meeting, whatever identifier the
 * caller sent: an admin of one body must not get a key that names a meeting
 * of another body. A file for a meeting that does not exist yet carries the
 * id of its body, so two bodies never share a key for the same date.
 */
export function uploadBaseFilename(config: UploadConfig | undefined, extension: string): string | null {
    const identifier = config?.councilMeetingId ?? config?.identifier;
    const parts = [
        config?.cityId,
        !config?.councilMeetingId && config?.administrativeBodyId ? config.administrativeBodyId : undefined,
        identifier,
        config?.suffix,
    ].filter(Boolean)
    return parts.length > 0 ? `${parts.join('_')}.${extension}` : null
}

/**
 * Who may upload under a config: a superadmin with no city, a city admin with
 * a city, the editors of the meeting when the config names one, and the
 * admins of the body when it names a body for a meeting not yet created.
 */
export function uploadAuthorizationScope(config: UploadConfig | undefined): AuthorizationScope {
    if (!config?.cityId) return {}
    if (config.councilMeetingId) return { cityId: config.cityId, councilMeetingId: config.councilMeetingId }
    if (config.administrativeBodyId) return { cityId: config.cityId, administrativeBodyId: config.administrativeBodyId }
    return { cityId: config.cityId }
}
