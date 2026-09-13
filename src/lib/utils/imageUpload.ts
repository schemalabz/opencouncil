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
