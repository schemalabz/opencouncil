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
/**
 * Content types accepted for logo uploads (cities, parties). Raster-only by
 * design: SVG is disallowed because logos are embedded in generated PDFs and
 * react-pdf can only draw PNG/JPEG. The upload UI's crop step already
 * converts everything to PNG — this guards direct API calls.
 */
export const ALLOWED_LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg'];

export interface UploadConfig {
    /** City identifier for authorization and naming */
    cityId?: string
    /** Entity identifier (e.g., meetingId, partySlug, personSlug) */
    identifier?: string
    /** Optional suffix for the filename (e.g., 'recording', 'agenda', 'logo') */
    suffix?: string
}

