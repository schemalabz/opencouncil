/**
 * Shared constants for the CivicMap suite. Visual thresholds live here as
 * named constants so they can be tuned in one place after seeing real data
 * density.
 */

export const MAP_STYLE_URL = 'mapbox://styles/christosporios/cm4icyrf700f201qw75bv27fa';
export const MAP_DEFAULT_CENTER: [number, number] = [23.7275, 37.9838]; // Athens
export const MAP_DEFAULT_ZOOM = 6.5;
export const MAP_MAX_ZOOM = 17;

export const FALLBACK_TOPIC_COLOR = '#627BBC';
export const FALLBACK_TOPIC_ICON = 'hash';

// Importance tiers, calibrated against the discussion-time distribution of
// real subjects (p25/p50/p75/p90 ≈ 71/163/351/721 seconds; speaker p90 = 4).
export const IMPORTANCE_HOT_MIN_SECONDS = 600;
export const IMPORTANCE_HOT_MIN_SPEAKERS = 5;
export const IMPORTANCE_MINOR_MAX_SECONDS = 120;
export const IMPORTANCE_MINOR_MAX_SPEAKERS = 1;

// Clustering
export const CLUSTER_RADIUS_PX = 56;
export const CLUSTER_RADIUS_MOBILE_PX = 48;
/**
 * Clustering runs through this zoom; from the next zoom every subject
 * renders individually (default: pins/dots from z14 up).
 */
export const CLUSTER_MAX_ZOOM = 13;

// Spiderfy (co-located subjects fan out around their shared location)
/** Anchor precision for "same spot" grouping: 6 decimals ≈ 0.1m. */
export const SPIDERFY_ANCHOR_PRECISION = 6;
export const SPIDERFY_CIRCLE_MAX = 8;
export const SPIDERFY_BADGE_SIZE_PX = 34;
/** Topics beyond this cap accumulate into a single overflow cluster property. */
export const CLUSTER_TOPIC_PROPERTY_CAP = 24;
export const CLUSTER_OTHER_KEY = 't_other';

// Donut cluster markers
export const DONUT_MAX_SEGMENTS = 5;
export const DONUT_OTHER_COLOR = '#d6d3d1'; // stone-300 — neutral "λοιπά" bucket
/** Minimum interactive hit area for cluster markers (touch target floor). */
export const DONUT_MIN_HIT_AREA_PX = 44;
/** A segment only gets a topic icon if at least this many px fit on its arc. */
export const DONUT_MIN_ICON_SIZE = 10;

// Municipalities petition heat — the fill ramp saturates at this count.
export const PETITION_HEAT_MAX = 50;

// Mapbox source ids
export const SUBJECTS_SOURCE_ID = 'civic-subjects';
export const SELECTED_SOURCE_ID = 'civic-selected';
export const MUNICIPALITIES_SOURCE_ID = 'civic-municipalities';

// Time filter
export const MAP_MONTHS_OPTIONS = [1, 3, 6, 12] as const;
export const MAP_DEFAULT_MONTHS_BACK = 6;
export const MAP_MONTHS_MIN = 1;
export const MAP_MONTHS_MAX = 24;
