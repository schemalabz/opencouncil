import { UPLOAD_IMAGE_TYPES } from '@opencouncil/subject-images/image';

/** The most an image upload may weigh, wherever the app accepts one. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/*
 * Which formats each surface accepts, and why the sets differ. This is the one
 * place to read "which images do we accept" from; each surface imports its set.
 */

/** Product-update emails: what Outlook desktop and the other clients render. WebP and AVIF are out. */
export const EMAIL_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif'] as const;

/**
 * City and party logos: react-pdf embeds them in generated PDFs and draws only
 * PNG and JPEG, so GIF and SVG are out. The upload UI's crop step already
 * converts everything to PNG; the list guards direct API calls.
 */
export const LOGO_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg'];

/** Subject illustrations: what sharp decodes safely, read from the bytes rather than the declared type. */
export const SUBJECT_IMAGE_TYPES = UPLOAD_IMAGE_TYPES;

/**
 * Share images (OG): the declared types and the size of a remote picture that
 * the renderer decodes (og/remoteImage.ts). Smaller than MAX_IMAGE_BYTES: a
 * larger stored photo is drawn on the site, and the share image uses its fallback.
 */
export const OG_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
export const OG_MAX_IMAGE_BYTES = 2_000_000;
export const OG_MAX_IMAGE_PIXELS = 4_000_000;

/**
 * The most pixels a stored copy of another host's image may decode to: a
 * 24-megapixel camera photo fits. next's image optimizer would otherwise
 * decode up to 268 megapixels for each width it serves.
 */
export const MAX_IMAGE_PIXELS = 25_000_000;

/**
 * Person photos copied from another host (populate_city): the types that the
 * share images draw too. The person form accepts any type (`imageFile()`):
 * an admin who uploads a GIF sees the result, an import that copies one would not.
 */
const PERSON_IMAGE_TYPES = OG_IMAGE_TYPES;

/** Each kind of stored image: the folder of the bucket it goes to, and the types (read from the bytes) a copy from another host may be. */
export const STORED_IMAGE_KINDS = {
    personImage: { prefix: 'person-images', types: PERSON_IMAGE_TYPES },
    partyLogo: { prefix: 'party-logos', types: LOGO_IMAGE_TYPES },
    cityLogo: { prefix: 'city-logos', types: LOGO_IMAGE_TYPES },
} as const;

export type StoredImageKind = keyof typeof STORED_IMAGE_KINDS;
