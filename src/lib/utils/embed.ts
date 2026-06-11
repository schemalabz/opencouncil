// Matches embed routes with or without a locale prefix, e.g.
// /embed/meetings, /en/embed/meetings. These are loaded inside iframes
// on third-party sites and must not be counted as analytics pageviews.
export const EMBED_PATH = /^\/(?:en\/|el\/)?embed(?:\/|$)/;
