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

/** The lens over the strip on long meetings: its box, and the viewport margin it keeps. */
export const LENS_HEIGHT = 104;
export const LENS_HEIGHT_COMPACT = 84;
export const LENS_GAP = 8;
export const LENS_MARGIN = 8;
