/**
 * The dock's vertical arithmetic, in one place. The box splits into a band
 * zone and the chapter rail; every layer that stops at that boundary (scroll
 * band, amber edit rows) derives from these instead of restating the numbers.
 * The page-level clearance tokens live in globals.css
 * (--playback-dock-clearance*), sized to DOCK_ROW plus the now-lane.
 */
export const DOCK_ROW = 62;
export const DOCK_ROW_COMPACT = 42;
export const RAIL_HEIGHT = 18;
export const BAND_ZONE = DOCK_ROW - RAIL_HEIGHT;

/** The lens over the strip on long meetings: its box, and its gap to the strip. */
export const LENS_HEIGHT = 108;
export const LENS_HEIGHT_COMPACT = 88;
export const LENS_GAP = 8;
