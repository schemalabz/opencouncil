import * as z from 'zod';
import { ALLOWED_LOGO_CONTENT_TYPES } from '@/types/upload';
import { MAX_IMAGE_BYTES } from '@/lib/utils/imageUpload';

/**
 * A boolean that arrives as text: a FormData field or a query parameter.
 * It accepts zod's lists in any case: `true`/`1`/`yes`/`on`/`y`/`enabled` and
 * `false`/`0`/`no`/`off`/`n`/`disabled`. Any other value is a validation
 * error, not a silent `false`. The app's own senders send `true` and `false`.
 */
export const stringBoolean = z.stringbool();

/**
 * A link that a person supplies and that we later render or fetch: http or
 * https only, so `javascript:`, `data:` and `ftp:` fail. It checks the
 * protocol only, not the host. `z.httpUrl()` also checks the host, and it
 * refuses Greek-script domains such as `δήμος.ελ`.
 */
export const webUrl = (params?: { error?: string }) => z.url({ protocol: /^https?$/, ...params });

/** A WGS84 latitude in degrees. */
export const latitude = z.number().min(-90).max(90);
/** A WGS84 longitude in degrees. */
export const longitude = z.number().min(-180).max(180);

const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

/** An uploaded image of any type. */
export const imageFile = () => z.file()
    .max(MAX_IMAGE_BYTES, { error: `Image must be at most ${MAX_IMAGE_MB} MB` });

/** An uploaded logo of a city or a party: only the types in ALLOWED_LOGO_CONTENT_TYPES. */
export const logoFile = (params?: { error?: string }) => z.file(params)
    .mime([...ALLOWED_LOGO_CONTENT_TYPES], { error: `Logo must be one of: ${ALLOWED_LOGO_CONTENT_TYPES.join(', ')}` })
    .max(MAX_IMAGE_BYTES, { error: `Logo must be at most ${MAX_IMAGE_MB} MB` });
