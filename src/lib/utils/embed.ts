import { localePrefixPattern } from '@/i18n/config';

// Matches embed routes with or without a locale prefix, e.g.
// /embed/meetings, /en/embed/meetings, /lat/embed/meetings. These are loaded
// inside iframes on third-party sites and must not be counted as analytics
// pageviews. Built from the shared locale-prefix set so new locales are
// covered automatically.
export const EMBED_PATH = new RegExp(`^/(?:(?:${localePrefixPattern})/)?embed(?:/|$)`);
